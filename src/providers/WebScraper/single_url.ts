import * as cheerio from 'cheerio';
import { ScrapingBeeClient } from 'scrapingbee';
import { attemptScrapWithRequests, sanitizeText } from './utils/utils';
import { excludeNonMainTags } from './utils/excludeTags';
import { extractMetadata } from './utils/metadata';
import dotenv from 'dotenv';
import { Document, PageOptions } from '../../lib/entities';
import { parseMarkdown } from '../../lib/html-to-markdown';
dotenv.config();

async function scrapWithScrapingBee(url: string): Promise<string | null> {
  try {
    const client = new ScrapingBeeClient(process.env.SCRAPING_BEE_API_KEY);
    const response = await client.get({
      url: url,
      params: { timeout: 15000 },
      headers: { 'ScrapingService-Request': 'TRUE' },
    });

    if (response.status !== 200 && response.status !== 404) {
      console.error(
        `Scraping bee error in ${url} with status code ${response.status}`
      );
      return null;
    }
    const decoder = new TextDecoder();
    const text = decoder.decode(response.data);
    return text;
  } catch (error) {
    console.error(`Error scraping with Scraping Bee: ${error}`);
    return null;
  }
}

export async function scrapWithCustomFirecrawl(
  url: string,
  options?: any
): Promise<string> {
  try {
    // TODO: merge the custom firecrawl scraper into mono-repo when ready
    return null;
  } catch (error) {
    console.error(`Error scraping with custom firecrawl-scraper: ${error}`);
    return '';
  }
}

export async function scrapSingleUrl(
  urlToScrap: string,
  toMarkdown: boolean = true,
  pageOptions: PageOptions = { onlyMainContent: true }
): Promise<Document> {
  urlToScrap = urlToScrap.trim();

  const removeUnwantedElements = (html: string, pageOptions: PageOptions) => {
    const soup = cheerio.load(html);
    soup('script, style, iframe, noscript, meta, head').remove();
    if (pageOptions.onlyMainContent) {
      // remove any other tags that are not in the main content
      excludeNonMainTags.forEach((tag) => {
        soup(tag).remove();
      });
    }
    return soup.html();
  };

  const attemptScraping = async (
    url: string,
    method:
      | 'firecrawl-scraper'
      | 'scrapingBee'
      | 'playwright'
      | 'scrapingBeeLoad'
      | 'fetch'
  ) => {
    let text = '';
    switch (method) {
      case 'firecrawl-scraper':
        text = await scrapWithCustomFirecrawl(url);
        break;
      case 'fetch':
        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.error(
              `Error fetching URL: ${url} with status: ${response.status}`
            );
            return '';
          }
          text = await response.text();
        } catch (error) {
          console.error(`Error scraping URL: ${error}`);
          return '';
        }
        break;
    }

    //* TODO: add an optional to return markdown or structured/extracted content
    const cleanedHtml = removeUnwantedElements(text, pageOptions);

    return [await parseMarkdown(cleanedHtml), text];
  };

  try {
    // TODO: comment this out once we're ready to merge firecrawl-scraper into the mono-repo
    // let [text, html] = await attemptScraping(urlToScrap, 'firecrawl-scraper');
    // if (!text || text.length < 100) {
    //   console.log("Falling back to scraping bee load");
    //   [text, html] = await attemptScraping(urlToScrap, 'scrapingBeeLoad');
    // }

    let [text, html] = await attemptScraping(urlToScrap, 'scrapingBee');
    // Basically means that it is using /search endpoint
    if (pageOptions.fallback === false) {
      const soup = cheerio.load(html);
      const metadata = extractMetadata(soup, urlToScrap);
      return {
        url: urlToScrap,
        content: text,
        markdown: text,
        metadata: { ...metadata, sourceURL: urlToScrap },
      } as Document;
    }
    if (!text || text.length < 100) {
      console.log('Falling back to playwright');
      [text, html] = await attemptScraping(urlToScrap, 'playwright');
    }

    if (!text || text.length < 100) {
      console.log('Falling back to scraping bee load');
      [text, html] = await attemptScraping(urlToScrap, 'scrapingBeeLoad');
    }
    if (!text || text.length < 100) {
      console.log('Falling back to fetch');
      [text, html] = await attemptScraping(urlToScrap, 'fetch');
    }

    const soup = cheerio.load(html);
    const metadata = extractMetadata(soup, urlToScrap);

    return {
      content: text,
      markdown: text,
      metadata: { ...metadata, sourceURL: urlToScrap },
    } as Document;
  } catch (error) {
    console.error(`Error: ${error} - Failed to fetch URL: ${urlToScrap}`);
    return {
      content: '',
      markdown: '',
      metadata: { sourceURL: urlToScrap },
    } as Document;
  }
}
