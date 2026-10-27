export async function onRequest(context) {
  const url = new URL(context.request.url);
  // 同时兼容 v 和 id 参数名，防止前端传参不匹配
  const videoId = url.searchParams.get('v') || url.searchParams.get('id');

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'Missing video ID', receivedUrl: context.request.url }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
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