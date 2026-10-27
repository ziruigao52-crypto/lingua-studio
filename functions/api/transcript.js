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
    // 尝试通过内置的公共解析通道直接获取标准字幕
    const response = await fetch(`https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      throw new Error('Caption not found');
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      }
    });
  } catch (err) {
    // 如果没有英文字幕，返回友好的提示
    return new Response(JSON.stringify({ error: 'No accessible English captions were found for this video.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}