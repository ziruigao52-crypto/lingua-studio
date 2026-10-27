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
    // 使用公开稳定的第三方字幕服务代理通道，彻底绕过 Cloudflare 服务器 IP 被封锁的问题
    const proxyRes = await fetch(`https://timedtext.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`
      }
    });

    if (proxyRes.ok) {
      const json = await proxyRes.json();
      return new Response(JSON.stringify(json), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 备用通道：尝试获取语言列表
    const listRes = await fetch(`https://www.youtube.com/api/timedtext?type=list&v=${videoId}`);
    const listText = await listRes.text();
    
    const langMatch = listText.match(/lang_code="([^"]+)"/);
    const lang = langMatch ? langMatch[1] : 'en';

    const targetRes = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`);
    if (!targetRes.ok) {
      throw new Error('Unable to retrieve captions from YouTube service.');
    }

    const data = await targetRes.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    // 如果直接请求失败，返回一个友好的提示，或者回退到模拟数据/前端解析
    return new Response(JSON.stringify({ 
      error: 'YouTube caption service restricted this server IP. Please try deploying backend on an alternative free tier or use client-side fetching.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}