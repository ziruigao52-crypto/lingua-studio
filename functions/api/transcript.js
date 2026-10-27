export async function onRequest(context) {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('v');

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Missing video ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  try {
    // 策略 1：直接尝试标准 timedtext 接口
    const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`;
    const response = await fetch(timedTextUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (response.ok) {
      const text = await response.text();
      if (text && text.trim().startsWith('{')) {
        return new Response(text, {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 策略 2：抓取播放页面并深度解析 ytInitialPlayerResponse 获取字幕轨道
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const watchRes = await fetch(watchUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await watchRes.text();

    let captionTracks = [];
    
    // 尝试提取 ytInitialPlayerResponse JSON
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/);
    if (playerMatch && playerMatch[1]) {
      try {
        const playerJson = JSON.parse(playerMatch[1]);
        captionTracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      } catch (e) {
        // 解析失败则忽略
      }
    }

    // 兜底策略：直接用正则匹配 captionTracks
    if (captionTracks.length === 0) {
      const match = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (match && match[1]) {
        try {
          captionTracks = JSON.parse(match[1]);
        } catch (e) {}
      }
    }

    if (captionTracks.length > 0) {
      // 优先匹配英文字幕（en 或其变体），否则取第一个可用字幕
      const englishTrack = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en')) || captionTracks[0];

      if (englishTrack && englishTrack.baseUrl) {
        const captionUrl = englishTrack.baseUrl + '&fmt=json3';
        const capRes = await fetch(captionUrl, {
          headers: { 'User-Agent': userAgent }
        });
        const capText = await capRes.text();
        return new Response(capText, {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'No accessible English captions were found or subtitle service is unavailable for this video.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}