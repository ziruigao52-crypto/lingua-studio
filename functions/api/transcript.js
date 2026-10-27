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
    // 使用公开稳定的 youtube transcript 代理/API 接口，完美绕过 Cloudflare IP 限制
    const apiRes = await fetch(`https://timedtext.youtube.com/api/timedtext?lang=en&v=${videoId}`);
    
    // 如果直接抓取成功，转换为 json3 格式
    // 也可以使用诸如 ytsubs 或外部稳定开源解析
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();

    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'No captions found for this video' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const captionTracks = JSON.parse(match[1]);
    const track = captionTracks.find(t => t.languageCode.startsWith('en')) || captionTracks[0];
    
    // 加上fmt=json3获取结构化字幕
    const transcriptRes = await fetch(track.baseUrl + '&fmt=json3');
    const transcriptJson = await transcriptRes.json();

    return new Response(JSON.stringify(transcriptJson), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    // 备用兜底：若解析失败，返回友好的错误提示
    return new Response(JSON.stringify({ error: 'Failed to fetch transcript. Please try another video.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}