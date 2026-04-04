import { countTokens } from '../utils/tokens.js';
import { convert } from 'html-to-text';

export interface FetchUrlArgs {
  url: string;
}

export interface FetchUrlResult {
  success: boolean;
  content?: string;
  error?: string;
  truncated?: boolean;
}

const MAX_URL_TOKENS = 12000; // Leaving room for other context

export async function fetchUrlTool(args: FetchUrlArgs): Promise<FetchUrlResult> {
  const { url } = args;
  
  if (!url) {
    return { success: false, error: 'URL is required' };
  }

  try {
    // Basic validation of URL
    new URL(url);
    
    // Fetch with a user agent so sites don't block us entirely as easily
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Kode-Agent/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(15000) // 15s timeout
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP Error: ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const textContent = await response.text();

    let processedContent = '';
    
    if (contentType.includes('text/html')) {
        processedContent = convert(textContent, {
            wordwrap: 120,
            preserveNewlines: true,
            selectors: [
                { selector: 'img', format: 'skip' },
                { selector: 'a', options: { ignoreHref: true } }
            ]
        });
    } else if (contentType.includes('application/json')) {
        try {
            // Keep JSON pretty
            const json = JSON.parse(textContent);
            processedContent = JSON.stringify(json, null, 2);
        } catch {
            processedContent = textContent;
        }
    } else {
        // Plain text or markdown
        processedContent = textContent;
    }

    const tokens = countTokens(processedContent);
    let truncated = false;

    // Very naive truncation to avoid filling context too much
    if (tokens > MAX_URL_TOKENS) {
        // Approximate ratio of chars per token is ~4. Cut to fit approx tokens.
        const lengthCutoff = MAX_URL_TOKENS * 3.5; 
        processedContent = processedContent.substring(0, lengthCutoff);
        truncated = true;
    }

    return {
      success: true,
      content: processedContent,
      truncated,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching URL';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export function formatFetchResult(result: FetchUrlResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  let output = result.content || '';

  if (result.truncated) {
    output += `\n\n[Content truncated: exceeded maximum token allowance. Focus on the most important parts first.]`;
  }

  return output;
}
