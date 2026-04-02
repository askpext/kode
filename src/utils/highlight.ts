import { highlight } from 'cli-highlight';

export interface HighlightOptions {
  lang?: string;
  theme?: string;
}

export function syntaxHighlight(code: string, options: HighlightOptions = {}): string {
  const { lang = 'auto', theme = 'atom-one-light' } = options;

  try {
    return highlight(code, {
      language: lang,
      theme: theme,
    });
  } catch {
    // Fallback to plain text if highlighting fails
    return code;
  }
}

export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    r: 'r',
    sql: 'sql',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    ps1: 'powershell',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  };

  return langMap[ext] || 'plaintext';
}

export function highlightFile(content: string, filePath: string): string {
  const lang = getLanguageFromPath(filePath);
  return syntaxHighlight(content, { lang });
}

export function highlightDiff(diff: string): string {
  const lines = diff.split('\n');
  const highlighted: string[] = [];

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      highlighted.push(`\u001b[32m${line}\u001b[0m`); // Green
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      highlighted.push(`\u001b[31m${line}\u001b[0m`); // Red
    } else if (line.startsWith('@@')) {
      highlighted.push(`\u001b[36m${line}\u001b[0m`); // Cyan
    } else if (line.startsWith('diff')) {
      highlighted.push(`\u001b[1m${line}\u001b[0m`); // Bold
    } else {
      highlighted.push(`\u001b[90m${line}\u001b[0m`); // Dim
    }
  }

  return highlighted.join('\n');
}
