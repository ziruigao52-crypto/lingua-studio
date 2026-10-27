export async function onRequest(context) {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('v') || url.searchParams.get('id');

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Missing video ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 使用更逼真的移动端/桌面端 User-Agent，并尝试直接获取 YouTube 内部 player 接口数据
    const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+410'
      }
    });

    const html = await ytRes.text();
    
    let captionTracks = null;
    const trackMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (trackMatch) {
      try {
        captionTracks = JSON.parse(trackMatch[1]);
      } catch (e) {}
    }

    // 备用方案：如果页面直连没抓到，尝试从 playerResponse 中解析
    if (!captionTracks) {
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/);
      if (playerMatch) {
        try {
          const playerJson = JSON.parse(playerMatch[1]);
          captionTracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        } catch (e) {}
      }
    }

    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ error: 'No captions found for this video. YouTube might be blocking the server IP.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 优先选择英文字幕
    const track = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en')) || captionTracks[0];

    const transcriptRes = await fetch(track.baseUrl + '&fmt=json3', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!transcriptRes.ok) {
      throw new Error('Failed to fetch transcript track data');
    }

    const transcriptJson = await transcriptRes.json();

    return new Response(JSON.stringify(transcriptJson), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}