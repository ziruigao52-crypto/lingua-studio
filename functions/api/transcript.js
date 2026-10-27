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
    // 使用 allorigins 代理服务获取 YouTube 字幕
    const targetUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`;
    const proxyRes = await fetch(`https://api.allorigins.win/raw?url=` + encodeURIComponent(targetUrl));
    
    if (!proxyRes.ok) {
      throw new Error('Proxy failed to fetch transcript');
    }

    const data = await proxyRes.json();
    return new Response(JSON.stringify(data), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch captions from YouTube.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}