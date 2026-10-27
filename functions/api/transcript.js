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
    // 1. 先获取视频页面的 playerResponse 数据
    const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = await ytRes.text();
    
    let captionTracks = null;
    
    // 尝试正则匹配 ytInitialPlayerResponse
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});<\/script>/);
    if (playerMatch) {
      try {
        const playerJson = JSON.parse(playerMatch[1]);
        captionTracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      } catch (e) {}
    }

    // 如果上面没抓到，尝试匹配 captionTracks
    if (!captionTracks) {
      const trackMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (trackMatch) {
        try {
          captionTracks = JSON.parse(trackMatch[1]);
        } catch (e) {}
      }
    }

    // 如果仍然没有，尝试通过 YouTube 的 timedtext 列表接口直接查询
    if (!captionTracks || captionTracks.length === 0) {
      const listRes = await fetch(`https://www.youtube.com/api/timedtext?type=list&v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const listXml = await listRes.text();
      
      // 从 XML 中提取字幕轨道
      const langMatches = [...listXml.matchAll(/lang_code="([^"]+)"/g)];
      if (langMatches.length > 0) {
        captionTracks = langMatches.map(m => ({
          languageCode: m[1],
          baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${m[1]}&fmt=json3`
        }));
      }
    }

    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ error: 'No captions found. This video might not have public closed captions enabled.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 优先选择英文（en）字幕，如果没有则取第一个
    const track = captionTracks.find(t => t.languageCode && t.languageCode.startsWith('en')) || captionTracks[0];
    const targetUrl = track.baseUrl.includes('fmt=json3') ? track.baseUrl : (track.baseUrl + '&fmt=json3');

    const transcriptRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!transcriptRes.ok) {
      throw new Error('Failed to fetch transcript content from YouTube');
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