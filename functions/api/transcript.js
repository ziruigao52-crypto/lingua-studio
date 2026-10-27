export async function onRequest(context) {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('v');

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Missing video ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  try {
    // 策略：通过代理/备用接口或完整浏览器头获取播放页
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const watchRes = await fetch(watchUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-US,en;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+111' // 绕过 YouTube 同意弹窗
      }
    });
    const html = await watchRes.text();

    let captionTracks = [];
    
    // 解析 ytInitialPlayerResponse
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/);
    if (playerMatch && playerMatch[1]) {
      try {
        const playerJson = JSON.parse(playerMatch[1]);
        captionTracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      } catch (e) {}
    }

    if (captionTracks.length === 0) {
      const match = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (match && match[1]) {
        try {
          captionTracks = JSON.parse(match[1]);
        } catch (e) {}
      }
    }

    if (captionTracks.length > 0) {
      const englishTrack = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en')) || captionTracks[0];

      if (englishTrack && englishTrack.baseUrl) {
        const captionUrl = englishTrack.baseUrl + '&fmt=json3';
        const capRes = await fetch(captionUrl, {
          headers: { 
            'User-Agent': userAgent,
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        const capText = await capRes.text();
        if (capText && capText.trim().startsWith('{')) {
          return new Response(capText, {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
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