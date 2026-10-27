export async function onRequest(context) {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('v');

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Missing video ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 调用 YouTube 官方前端实际使用的 Innertube API 获取播放详情（包含字幕轨道）
    const innertubeRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00'
          }
        },
        videoId: videoId
      })
    });

    if (!innertubeRes.ok) {
      throw new Error('Failed to connect to YouTube API');
    }

    const data = await innertubeRes.json();
    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ error: 'No captions found for this video' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 优先匹配英文字幕，没有则取第一个
    const track = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en')) || captionTracks[0];

    // 请求结构化的 json3 格式字幕
    const transcriptRes = await fetch(track.baseUrl + '&fmt=json3', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!transcriptRes.ok) {
      throw new Error('Failed to download transcript track');
    }

    const transcriptJson = await transcriptRes.json();

    return new Response(JSON.stringify(transcriptJson), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch transcript' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}