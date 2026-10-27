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
    // 方案：直接请求 YouTube 播放页面的 HTML 并稳健提取 captionTracks
    const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = await ytRes.text();
    
    // 提取 playerResponse JSON
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/) || html.match(/"captions":\s*(\{[^n].+?\})\s*,\s*"videoDetails"/);
    
    let captionTracks = null;
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || data?.playerCaptionsTracklistRenderer?.captionTracks;
      } catch (e) {}
    }

    // 如果常规正则未命中，尝试备用正则匹配 captionTracks
    if (!captionTracks) {
      const trackMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (trackMatch) {
        try {
          captionTracks = JSON.parse(trackMatch[1]);
        } catch (e) {}
      }
    }

    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ error: 'No captions found for this video' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const track = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en')) || captionTracks[0];

    const transcriptRes = await fetch(track.baseUrl + '&fmt=json3', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!transcriptRes.ok) {
      throw new Error('Failed to fetch transcript file');
    }

    const transcriptJson = await transcriptRes.json();

    return new Response(JSON.stringify(transcriptJson), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Server error fetching transcript' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}