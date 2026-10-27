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
    // 1. 先通过 YouTube 官方的公开字幕列表接口获取该视频可用的字幕轨道列表
    const listRes = await fetch(`https://video.google.com/timedtext?type=list&v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    const listXml = await listRes.text();

    // 从 XML 中匹配语言代码（优先找 en 或以 en 开头的英语字幕）
    const langMatches = [...listXml.matchAll(/lang_code="([^"]+)"/g)];
    const langs = langMatches.map(m => m[1]);

    if (langs.length === 0) {
      return new Response(JSON.stringify({ error: 'No captions found for this video' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const targetLang = langs.find(l => l.startsWith('en')) || langs[0];

    // 2. 直接请求该语言的结构化 JSON3 字幕数据
    const transcriptRes = await fetch(`https://www.youtube.com/api/timedtext?lang=${targetLang}&v=${videoId}&fmt=json3`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!transcriptRes.ok) {
      throw new Response(JSON.stringify({ error: 'Failed to download transcript track' }));
    }

    const transcriptJson = await transcriptRes.json();

    return new Response(JSON.stringify(transcriptJson), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch transcript' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}