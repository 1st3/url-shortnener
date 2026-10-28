export function renderErrorPage(statusCode: number, title: string, message: string, homeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${statusCode} - ${title} | brzl.ca</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card: #151c2e;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --border: #1f293d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      background: rgba(59, 130, 246, 0.15);
      color: var(--primary);
      font-size: 0.875rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      color: #fff;
    }
    p {
      color: var(--text-muted);
      font-size: 1rem;
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    .btn {
      display: inline-block;
      background: var(--primary);
      color: white;
      text-decoration: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.95rem;
      transition: background 0.2s ease;
    }
    .btn:hover {
      background: var(--primary-hover);
    }
    .footer {
      margin-top: 2rem;
      font-size: 0.8rem;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">HTTP ${statusCode}</span>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${homeUrl}" class="btn">Go to Homepage</a>
    <div class="footer">brzl.ca URL Shortener</div>
  </div>
</body>
</html>`;
}
