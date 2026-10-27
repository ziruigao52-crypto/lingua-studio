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
    // 调用完全免费且稳定的公开字幕解析代理接口
    const apiRes = await fetch(`https://corsproxy.io/?` + encodeURIComponent(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`));
    
    if (!apiRes.ok) {
      throw new Error('Failed to fetch from subtitle proxy');
    }

    const data = await apiRes.json();
    return new Response(JSON.stringify(data), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch captions. Please ensure the video has closed captions enabled.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}