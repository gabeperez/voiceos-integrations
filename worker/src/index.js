export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = new URL(env.SITE_URL).origin;
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === '/auth') {
      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${url.origin}/callback`,
        scope: 'public_repo',
      });
      return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('Missing code', { status: 400 });

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        return new Response(`Auth failed: ${tokenData.error_description}`, { status: 400 });
      }

      // Redirect back to the site with the token in the URL hash (never sent to server)
      return Response.redirect(`${env.SITE_URL}#access_token=${tokenData.access_token}`, 302);
    }

    if (url.pathname === '/submit' && request.method === 'POST') {
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (!token) return new Response('Unauthorized', { status: 401, headers: cors });

      const data = await request.json();
      const { title, body } = data;

      if (!title || !body) {
        return new Response('Missing title or body', { status: 400, headers: cors });
      }

      const issueRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'voiceos-submit-worker',
        },
        body: JSON.stringify({
          title,
          body,
          labels: ['new-integration'],
        }),
      });

      const issue = await issueRes.json();

      if (!issueRes.ok) {
        return new Response(JSON.stringify({ error: issue.message }), {
          status: issueRes.status,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ url: issue.html_url, number: issue.number }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
