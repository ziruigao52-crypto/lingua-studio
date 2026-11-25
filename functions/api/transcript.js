export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method === 'POST') {
    return handleAudioTranscription(request, env);
  }

  const url = new URL(request.url);
  const inputUrl = (url.searchParams.get('url') || url.searchParams.get('v') || '').trim();

  if (!inputUrl) {
    return jsonResponse({ error: '请提供有效的视频链接或视频 ID' }, 400);
  }

  try {
    if (inputUrl.includes('youtube.com') || inputUrl.includes('youtu.be') || /^[a-zA-Z0-9_-]{11}$/.test(inputUrl)) {
      return await handleYouTube(inputUrl);
    }
    if (inputUrl.includes('bilibili.com') || /BV[a-zA-Z0-9]+/i.test(inputUrl)) {
      return await handleBilibili(inputUrl);
    }
    if (/\.(vtt|srt)(\?.*)?$/i.test(inputUrl)) {
      return await handleSubtitleFile(inputUrl);
    }
    if (/\.(mp4|mp3|m4a|wav|webm|ogg)(\?.*)?$/i.test(inputUrl)) {
      return await handleDirectMediaUrl(inputUrl, env);
    }
    return jsonResponse({ error: '暂不支持该链接格式' }, 400);
  } catch (err) {
    return jsonResponse({ error: `服务执行异常: ${err.message}` }, 500);
  }
}

async function handleYouTube(input) {
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  const videoId = match ? match[1] : input;
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const watchRes = await fetch(watchUrl, {
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+111'
    }
  });
  const html = await watchRes.text();

  let captionTracks = [];
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/);
  if (playerMatch && playerMatch[1]) {
    try {
      const playerJson = JSON.parse(playerMatch[1]);
      captionTracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    } catch (e) {}
  }

  if (captionTracks.length === 0) {
    const fallbackMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (fallbackMatch && fallbackMatch[1]) {
      try {
        captionTracks = JSON.parse(fallbackMatch[1]);
      } catch (e) {}
    }
  }

  if (captionTracks.length > 0) {
    const targetTrack = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en')) || captionTracks[0];
    if (targetTrack && targetTrack.baseUrl) {
      const capRes = await fetch(`${targetTrack.baseUrl}&fmt=json3`, {
        headers: { 'User-Agent': userAgent }
      });
      const capText = await capRes.text();
      if (capText && capText.trim().startsWith('{')) {
        return new Response(capText, {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
  }
  return jsonResponse({ error: '该 YouTube 视频未找到可用的英文字幕轨道' }, 404);
}

async function handleBilibili(input) {
  const bvMatch = input.match(/(BV[a-zA-Z0-9]+)/i);
  if (!bvMatch) return jsonResponse({ error: '无效的 Bilibili BV 号' }, 400);

  const bvid = bvMatch[1];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
  };

  const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers });
  const viewData = await viewRes.json();
  const cid = viewData?.data?.cid;
  if (!cid) return jsonResponse({ error: '无法获取 Bilibili 视频 cid 信息' }, 404);

  const playerRes = await fetch(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`, { headers });
  const playerData = await playerRes.json();
  const subtitles = playerData?.data?.subtitle?.subtitles || [];

  if (subtitles.length === 0) return jsonResponse({ error: '该 Bilibili 视频暂无可用 CC 字幕' }, 404);

  const targetSub = subtitles.find(s => s.lan && s.lan.includes('en')) || subtitles[0];
  let subUrl = targetSub.subtitle_url;
  if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;

  const subRes = await fetch(subUrl, { headers });
  const subJson = await subRes.json();

  const events = (subJson.body || []).map(item => ({
    tStartMs: Math.floor((item.from || 0) * 1000),
    dDurationMs: Math.floor(((item.to || 0) - (item.from || 0)) * 1000),
    segs: [{ utf8: item.content || '' }]
  }));

  return jsonResponse({ events });
}

async function handleSubtitleFile(fileUrl) {
  const res = await fetch(fileUrl);
  if (!res.ok) return jsonResponse({ error: '无法下载字幕文件' }, 400);
  const rawText = await res.text();
  const events = parseSrtOrVttToJson3(rawText);
  return jsonResponse({ events });
}

async function handleDirectMediaUrl(mediaUrl, env) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: '未配置 OPENAI_API_KEY 环境变量' }, 501);
  }
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) return jsonResponse({ error: '无法下载指定的音视频直链文件' }, 400);
  const audioBlob = await mediaRes.blob();
  return callWhisperAPI(audioBlob, env);
}

async function handleAudioTranscription(request, env) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: '未配置 OPENAI_API_KEY 环境变量' }, 501);
  }
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return jsonResponse({ error: '未检测到上传的文件对象' }, 400);
  return callWhisperAPI(file, env);
}

async function callWhisperAPI(fileData, env) {
  const apiForm = new FormData();
  apiForm.append('file', fileData, 'media.mp3');
  apiForm.append('model', 'whisper-1');
  apiForm.append('response_format', 'verbose_json');

  const apiBase = env.OPENAI_API_BASE || 'https://api.openai.com/v1';
  const whisperRes = await fetch(`${apiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
    body: apiForm
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    return jsonResponse({ error: `AI 转写接口报错: ${errText}` }, 502);
  }

  const result = await whisperRes.json();
  const events = (result.segments || []).map(seg => ({
    tStartMs: Math.floor(seg.start * 1000),
    dDurationMs: Math.floor((seg.end - seg.start) * 1000),
    segs: [{ utf8: seg.text.trim() }]
  }));

  return jsonResponse({ events });
}

function parseSrtOrVttToJson3(text) {
  const events = [];
  const blocks = text.replace(/\r\n/g, '\n').split('\n\n');
  const timeRegex = /(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3})/;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const timeIdx = lines.findIndex(l => timeRegex.test(l));
    if (timeIdx === -1) continue;

    const match = lines[timeIdx].match(timeRegex);
    const startMs = ((parseInt(match[1]||'0',10)*3600 + parseInt(match[2],10)*60 + parseInt(match[3],10))*1000) + parseInt(match[4],10);
    const endMs = ((parseInt(match[5]||'0',10)*3600 + parseInt(match[6],10)*60 + parseInt(match[7],10))*1000) + parseInt(match[8],10);
    const content = lines.slice(timeIdx + 1).join(' ').replace(/<[^>]+>/g, '').trim();

    if (content) {
      events.push({
        tStartMs: startMs,
        dDurationMs: Math.max(0, endMs - startMs),
        segs: [{ utf8: content }]
      });
    }
  }
  return events;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}