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
    const ytResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await ytResponse.text();

    // 尝试多种正则模式匹配 ytInitialPlayerResponse
    let playerResponse = null;
    const regexes = [
      /ytInitialPlayerResponse\s*=\s*({.+?});<\/script>/s,
      /ytInitialPlayerResponse\s*=\s*({.+?});\s*var/s,
      /ytInitialPlayerResponse['"]?\s*:\s*({.+?}),\s*['"]?/s
    ];

    for (const regex of regexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        try {
          playerResponse = JSON.parse(match[1]);
          break;
        } catch (e) {
          // JSON 解析失败则继续尝试下一个正则
        }
      }
    }

    // 如果上面没匹配到，尝试截取字符串方式
    if (!playerResponse) {
      const idx = html.indexOf('ytInitialPlayerResponse =');
      if (idx !== -1) {
        try {
          const sub = html.substring(idx + 25);
          // 寻找合适的结束位置
          const endIdx = sub.lastIndexOf('};');
          if (endIdx !== -1) {
            playerResponse = JSON.parse(sub.substring(0, endIdx + 1));
          }
        } catch (e) {}
      }
    }

    if (!playerResponse) {
      return new Response(JSON.stringify({ error: 'Could not parse player response from YouTube' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ error: 'No captions found for this video' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const track = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en')) || captionTracks[0];
    const transcriptRes = await fetch(track.baseUrl + '&fmt=json3');
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