// This file will contain the Puppeteer logic for PDF export. 

import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { PDFDocument } from 'pdf-lib'; // Added for PDF merging
import { v4 as uuidv4 } from 'uuid'; // For generating unique job IDs
import pdfCompressionService from './pdf-compression.js'; // Import compression service
import { config } from 'dotenv';

// Load environment variables
config();

// Log environment variables status (without exposing the actual values)
console.log('[PuppeteerExport] Environment check:');
console.log('[PuppeteerExport] ILOVEPDF_PUBLIC_KEY exists:', !!process.env.ILOVEPDF_PUBLIC_KEY);
console.log('[PuppeteerExport] ILOVEPDF_SECRET_KEY exists:', !!process.env.ILOVEPDF_SECRET_KEY);

// In-memory store for export job statuses
const exportJobs = {};

// Function to clean up old jobs (e.g., after a certain time)
// Simple example: remove jobs older than 1 hour
setInterval(() => {
    const now = Date.now();
    for (const jobId in exportJobs) {
        if (exportJobs[jobId].status === 'complete' || exportJobs[jobId].status === 'error') {
            if (now - (exportJobs[jobId].lastUpdated || 0) > 3600000) { // 1 hour
                console.log(`[JobCleanup] Removing old job: ${jobId}`);
                if (exportJobs[jobId].jobOutputDir && exportJobs[jobId].status !== 'error') { // Don't delete if error might be needed
                    fs.remove(exportJobs[jobId].jobOutputDir)
                        .then(() => console.log(`[JobCleanup] Cleaned up job output directory: ${exportJobs[jobId].jobOutputDir} for job ${jobId}`))
                        .catch(err => console.error(`[JobCleanup] Error cleaning up job output directory ${exportJobs[jobId].jobOutputDir} for job ${jobId}:`, err));
                }
                delete exportJobs[jobId];
            }
        }
    }
}, 60 * 60 * 1000); // Run every hour

// Function to create a project state for a single page
function createSinglePageProjectState(fullProjectState, pageIndexToExport) {
    console.log(`[SinglePageState] Creating state for page index: ${pageIndexToExport}`);
    const pageToExport = fullProjectState.pages[pageIndexToExport];

    if (!pageToExport) {
        console.error(`[SinglePageState] Error: Page at index ${pageIndexToExport} not found.`);
        return null;
    }

    // Collect image IDs used on this specific page (panels, background, stickers)
    const usedImageIds = new Set();
    if (pageToExport.panelStates) {
        pageToExport.panelStates.forEach(panel => {
            if (panel.imageId) usedImageIds.add(panel.imageId);
        });
    }
    if (pageToExport.backgroundState && pageToExport.backgroundState.imageId) {
        usedImageIds.add(pageToExport.backgroundState.imageId);
    }
    if (pageToExport.stickerStates) {
        pageToExport.stickerStates.forEach(sticker => {
            if (sticker.imageId) usedImageIds.add(sticker.imageId);
        });
    }
    console.log(`[SinglePageState] Page ${pageIndexToExport} uses image IDs:`, Array.from(usedImageIds));

    // Filter the full project's images to include only those used on this page
    const imagesForThisPage = fullProjectState.images.filter(img => usedImageIds.has(img.id));

    const singlePageProjectState = {
        version: fullProjectState.version,
        canvasDimensionKey: fullProjectState.canvasDimensionKey,
        canvasWidth: fullProjectState.canvasWidth,
        canvasHeight: fullProjectState.canvasHeight,
        useGlobalBackgroundStyle: fullProjectState.useGlobalBackgroundStyle,
        globalBackgroundStyle: fullProjectState.globalBackgroundStyle,
        pages: [pageToExport],
        images: imagesForThisPage,
        currentPageIndex: 0,
        folderStructure: fullProjectState.folderStructure,
        currentFolderId: fullProjectState.currentFolderId,
        customLayouts: fullProjectState.customLayouts,
    };
    console.log(`[SinglePageState] Created state for page ${pageIndexToExport}. Images included: ${imagesForThisPage.length}. Original project images: ${fullProjectState.images.length}`);
    return singlePageProjectState;
}


async function capturePageAsImage(comicCreatorUrl, outputDirectory, projectState, outputPdfPath) { // Added outputPdfPath
  console.log(`[Puppeteer] Launching browser for output: ${outputPdfPath}`);
  
  // Configure browser for Ubuntu Droplet environment
  console.log('Environment details:', {
    NODE_ENV: process.env.NODE_ENV,
    PLATFORM: process.platform,
    PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH
  });

  // Determine Chrome executable path for Ubuntu
  const chromeExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
    '/usr/bin/google-chrome-stable' || 
    '/usr/bin/google-chrome' || 
    '/usr/bin/chromium' ||
    '/usr/bin/chromium-browser';

  // Verify Chrome exists
  try {
    await fs.access(chromeExecutablePath);
    console.log(`[Puppeteer] Verified Chrome exists at: ${chromeExecutablePath}`);
  } catch (error) {
    console.error(`[Puppeteer] Chrome not found at ${chromeExecutablePath}. Error:`, error);
    throw new Error(`Chrome not found at ${chromeExecutablePath}. Please install Chrome/Chromium.`);
  }

  console.log(`[Puppeteer] Using Chrome executable: ${chromeExecutablePath}`);

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: chromeExecutablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-component-extensions-with-background-pages',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-report-upload',
      '--disable-crash-reporter',
      '--window-size=1280,800',
      '--virtual-time-budget=30000'
    ],
    defaultViewport: {
      width: 1280,
      height: 800
    },
    timeout: 60000
  });

  let page;
  try {
    // Create new page
    page = await browser.newPage();
    
    // Set longer timeout for navigation and element waiting
    page.setDefaultTimeout(60000);
    
    // Set viewport
    await page.setViewport({ 
      width: 1920, 
      height: 1080,
      deviceScaleFactor: 2
    });

    // Important: Set up page handlers BEFORE any navigation
    await page.evaluateOnNewDocument(() => {
      window.onbeforeunload = null;
      window.IS_PUPPETEER_EXPORT = true;
      console.log('[Pre-Navigation] Set IS_PUPPETEER_EXPORT flag');
    });

    // Enable request interception
    await page.setRequestInterception(true);
    page.on('request', request => {
      request.continue().catch(err => console.error('[Puppeteer] Error continuing request:', err));
      if (request.failure()) {
        console.error(`[Puppeteer] Request failed: URL: ${request.url()}, Error: ${request.failure().errorText}`);
      }
    });

    // Log console messages
    page.on('console', msg => console.log('[Page Console]', msg.text()));
    page.on('pageerror', err => console.error('[Page Error]', err));

    // Add initial delay before navigation
    await page.waitForTimeout(2000);
    console.log(`[Puppeteer] Starting navigation to: ${comicCreatorUrl}`);

    // Navigate with robust wait conditions
    const response = await page.goto(comicCreatorUrl, { 
      waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
      timeout: 60000
    });

    if (!response.ok()) {
      throw new Error(`Failed to load page: ${response.status()} ${response.statusText()}`);
    }

    // Add post-navigation delay
    console.log(`[Puppeteer] Navigation complete. Waiting for page stabilization...`);
    await page.waitForTimeout(3000);

    console.log(`[Puppeteer] Waiting for comic canvas...`);

    // Wait for the comic canvas with extended timeout and visibility check
    try {
      // First ensure the page is fully loaded
      console.log('[Puppeteer] Waiting for full page load...');
      await page.waitForFunction(() => {
        return document.readyState === 'complete' && 
               typeof window.comicCreator !== 'undefined' &&
               window.IS_PUPPETEER_EXPORT === true;
      }, { timeout: 30000 });
      
      console.log('[Puppeteer] Page fully loaded, now waiting for comic canvas...');
      
      // Then wait for the canvas
      await page.waitForFunction(() => {
        const canvas = document.querySelector('#comic-canvas');
        if (!canvas) {
          console.log('[Page Eval] #comic-canvas not found yet.');
          return false;
        }
        const style = window.getComputedStyle(canvas);
        if (style.display === 'none') {
          console.log('[Page Eval] #comic-canvas found but display is none.');
          return false;
        }
        return true;
      }, { timeout: 60000 });
      
      console.log('[Puppeteer] Successfully found #comic-canvas.');

    } catch (error) {
      console.error('[Puppeteer] Failed to find comic canvas. DOM state before error:');
      try {
        const domState = await page.evaluate(() => document.body.innerHTML);
        console.error(domState);
      } catch (evalError) {
        console.error('[Puppeteer] Could not even evaluate document.body.innerHTML after waitForFunction error:', evalError.message);
      }
      throw error;
    }

    // Inject CSS to ensure consistent rendering
    await page.addStyleTag({
      content: `
        #comic-canvas {
          transform: none !important;
          transition: none !important;
          opacity: 1 !important;
          visibility: visible !important;
          display: block !important;
        }
        /* Ensure text bubbles are rendered statically and centered for rotation */
        body.exporting .text-bubble,
        .text-bubble.exporting-direct-style {
          transform-origin: center center !important; 
          transition: none !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        body.exporting .text-bubble .text-content {
          margin: 0 !important;
          padding: 0 !important;
          vertical-align: top !important;
        }
        .canvas-sticker-image {
          transform-origin: center center !important;
          transition: none !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        .comic-panel img {
          transition: none !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        .canvas-background-image {
          transition: none !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
      `
    });

    // STEP 1: Verify comicCreator and the method exist
    console.log('[Puppeteer] Verifying window.comicCreator and _loadProjectFromState method...');
    const comicCreatorCheck = await page.evaluate(() => {
      let attempts = 0;
      while (!window.comicCreator && attempts < 100) {
        // Not using await new Promise here as it might be too complex if page is unstable
        // Synchronous wait/check is fine within evaluate for this simple check.
        // For longer waits, use waitForFunction directly in Puppeteer's context.
        // This loop is primarily to catch if comicCreator is defined *slightly* later.
        console.log(`[Page Eval - Check] Attempt ${attempts + 1}: window.comicCreator is ${typeof window.comicCreator}`);
        // Basic synchronous delay, less reliable but avoids nested promises in a potentially unstable context
        const start = Date.now();
        while (Date.now() - start < 100) { /* do nothing */ }
        attempts++;
      }

      if (!window.comicCreator) {
        console.error('[Page Eval - Check] window.comicCreator not found after checks.');
        return { found: false, methodFound: false, error: 'window.comicCreator not found' };
      }
      console.log('[Page Eval - Check] window.comicCreator IS found.');
      if (typeof window.comicCreator._loadProjectFromState !== 'function') {
        console.error('[Page Eval - Check] window.comicCreator._loadProjectFromState is NOT a function. Type: ' + typeof window.comicCreator._loadProjectFromState);
        return { found: true, methodFound: false, error: '_loadProjectFromState is not a function' };
      }
      console.log('[Page Eval - Check] window.comicCreator._loadProjectFromState IS a function.');
      return { found: true, methodFound: true };
    });

    console.log('[Puppeteer] Comic creator check results:', comicCreatorCheck);

    if (!comicCreatorCheck || !comicCreatorCheck.found || !comicCreatorCheck.methodFound) {
      const errorMessage = comicCreatorCheck && comicCreatorCheck.error ? comicCreatorCheck.error : 'Comic creator or method not found.';
      console.error(`[Puppeteer] Failed comic creator sanity check: ${errorMessage}`);
      throw new Error(`Failed comic creator sanity check: ${errorMessage}`);
    }
    console.log('[Puppeteer] window.comicCreator and method _loadProjectFromState verified.');

    // Ensure fonts are loaded before attempting to load the project state
    console.log('[Puppeteer] Waiting for document fonts to be ready...');
    await page.evaluate(() => document.fonts.ready);
    console.log('[Puppeteer] Document fonts are ready.');

    // Expose a function to the page that can return the projectState.
    // This avoids serializing the potentially huge projectState as a direct argument to page.evaluate.
    console.log('[Puppeteer] Exposing window.getPuppeteerProjectState function...');
    await page.exposeFunction('getPuppeteerProjectState', () => {
        console.log('[Puppeteer Node.js Context] getPuppeteerProjectState called from page. Returning JSON string...');
        try {
            const jsonString = JSON.stringify(projectState);
            console.log(`[Puppeteer Node.js Context] projectState stringified. Length: ${jsonString.length}`);
            return jsonString;
        } catch (stringifyError) {
            console.error('[Puppeteer Node.js Context] Error stringifying projectState:', stringifyError);
            return null; // Or throw, so the page knows something went wrong
        }
    });
    console.log('[Puppeteer] window.getPuppeteerProjectState exposed.');

    // STEP 2: Now attempt to load the project state
    console.log('[Puppeteer] Attempting to call _loadProjectFromState via page.evaluate, using exposed function for state...');
    const loadResult = await page.evaluate(async () => { // Renamed from loadSuccess
        console.log('[Page Eval - Load] Entered page.evaluate for _loadProjectFromState.');
        let stateFromNode;
        try {
            console.log('[Page Eval - Load] Calling window.getPuppeteerProjectState()...');
            const projectStateJSON = await window.getPuppeteerProjectState();
            console.log(`[Page Eval - Load] Received potential JSON string from getPuppeteerProjectState. Length: ${projectStateJSON ? projectStateJSON.length : 'null/undefined'}`);
            if (!projectStateJSON) {
                console.error('[Page Eval - Load] projectStateJSON is null or undefined after calling getPuppeteerProjectState.');
                return { success: false, error: 'Received null/undefined projectStateJSON from getPuppeteerProjectState' };
            }
            console.log('[Page Eval - Load] Parsing projectStateJSON...');
            stateFromNode = JSON.parse(projectStateJSON);
            console.log('[Page Eval - Load] projectStateJSON parsed successfully.');
        } catch (e) {
            console.error('[Page Eval - Load] Error calling getPuppeteerProjectState or parsing its result:', e);
            return { success: false, error: `Error getting/parsing state: ${e.message}` };
      }
      
        if (!window.comicCreator) {
            console.error('[Page Eval - Load] window.comicCreator not found.');
            return { success: false, error: 'window.comicCreator not found' };
        }
        if (typeof window.comicCreator._loadProjectFromState !== 'function') {
            console.error('[Page Eval - Load] window.comicCreator._loadProjectFromState is not a function.');
            return { success: false, error: 'window.comicCreator._loadProjectFromState not a function' };
        }

        try {
            console.log('[Page Eval - Load] Calling window.comicCreator._loadProjectFromState...');
            await window.comicCreator._loadProjectFromState(stateFromNode);
            console.log('[Page Eval - Load] _loadProjectFromState completed.');
            // Add a slight delay or a more robust check to ensure rendering is complete
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 sec for rendering
            return { success: true };
        } catch (e) {
            console.error('[Page Eval - Load] Error executing _loadProjectFromState:', e);
            return { success: false, error: `Error in _loadProjectFromState: ${e.message}` };
        }
    });

    // console.log('[Puppeteer] Load success status from page.evaluate:', loadSuccess); // old
    console.log('[Puppeteer] Load result from page.evaluate:', loadResult);


    // if (!loadSuccess || (typeof loadSuccess === 'object' && !loadSuccess.success)) { // old
    //     const errorMessage = typeof loadSuccess === 'object' && loadSuccess.error ? loadSuccess.error : 'Failed to load project state in Puppeteer page.';
    //     console.error(`[Puppeteer] Project loading failed: ${errorMessage}`);
    //     throw new Error(`Project loading failed in Puppeteer: ${errorMessage}`);
    // }
    if (!loadResult || !loadResult.success) {
        const errorMessage = loadResult && loadResult.error ? loadResult.error : 'Unknown error during project state loading in Puppeteer page.';
        console.error(`[Puppeteer] Project loading failed: ${errorMessage}`);
        // Try to get more details from the page if possible
        const pageError = await page.evaluate(() => {
          return window.comicCreator ? window.comicCreator.lastError : "No specific error found on comicCreator.";
        }).catch(e => `Could not get error from page: ${e.message}`);
        console.error(`[Puppeteer] Page-specific error detail: ${pageError}`);
        throw new Error(`Project loading failed in Puppeteer: ${errorMessage}. Page detail: ${pageError}`);
    }


    console.log('[Puppeteer] Project state loaded successfully. Waiting for any final rendering...');
    
    // console.log(`[Puppeteer] Waiting for element #page-0-panel-0 or #page-0-canvas-text-0...`);
    // await page.waitForFunction(() => {
    //     return document.querySelector('#page-0-panel-0') || document.querySelector('#page-0-canvas-text-0');
    // }, { timeout: 30000 });
    // console.log('[Puppeteer] At least one expected page element found.');
    
    // Instead of specific elements, let's wait for images to be loaded if that's a concern
    console.log('[Puppeteer] Waiting for images to load on the page (if any)...');
    await page.evaluate(async () => {
        const images = Array.from(document.images);
        const promises = images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve, reject) => {
              img.onload = resolve;
                img.onerror = () => resolve(); // Resolve on error too, don't block indefinitely
            });
        });
        await Promise.all(promises);
    }, { timeout: 60000 }); // Extended timeout for image loading
    console.log('[Puppeteer] All images on page considered loaded or timed out.');

    // Wait for a short fixed time after image loading to allow final rendering tweaks
    await new Promise(resolve => setTimeout(resolve, 1500)); // Adjust as needed
    console.log('[Puppeteer] Final rendering delay complete.');

    console.log('[Puppeteer] About to get boundingBox. Checking canvas computed styles...');
    console.log(`[Puppeteer] Project state dimensions for check: Width=${projectState.canvasWidth}, Height=${projectState.canvasHeight}`);
    const canvasComputedStyles = await page.evaluate(() => {
        const canvas = document.querySelector('#comic-canvas');
        if (!canvas) return { error: '#comic-canvas not found' };
        const styles = window.getComputedStyle(canvas);
        const cs = {
            width: styles.width,
            height: styles.height,
            minWidth: styles.minWidth,
            minHeight: styles.minHeight,
            maxWidth: styles.maxWidth,
            maxHeight: styles.maxHeight,
            cssVariableWidth: getComputedStyle(document.documentElement).getPropertyValue('--canvas-width').trim(),
            cssVariableHeight: getComputedStyle(document.documentElement).getPropertyValue('--canvas-height').trim(),
            offsetWidth: canvas.offsetWidth,
            offsetHeight: canvas.offsetHeight,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
            scrollWidth: canvas.scrollWidth,
            scrollHeight: canvas.scrollHeight
        };
        // Check parent dimensions too
        if (canvas.parentElement) {
            const parentStyles = window.getComputedStyle(canvas.parentElement);
            cs.parentWidth = parentStyles.width;
            cs.parentHeight = parentStyles.height;
            cs.parentOffsetWidth = canvas.parentElement.offsetWidth;
            cs.parentOffsetHeight = canvas.parentElement.offsetHeight;
        }
        return cs;
    });
    console.log('[Puppeteer] Canvas Computed Styles in Puppeteer:', canvasComputedStyles);

    // Temporarily hide all elements except the comic canvas and its parents/ancestors
    await page.evaluate(() => {
        const canvas = document.querySelector('#comic-canvas');
        if (!canvas) return;

        // Function to apply style to an element and store its original style
        const setStyle = (element, styleProperty, value) => {
            if (!element.dataset.originalInlineStyle) {
                element.dataset.originalInlineStyle = element.getAttribute('style') || '';
            }
            element.style.setProperty(styleProperty, value, 'important');
        };

        // Hide all direct children of body initially
        const bodyChildren = Array.from(document.body.children);
        bodyChildren.forEach(child => {
            // Check if the child is the canvas itself or contains the canvas
            if (child !== canvas && !child.contains(canvas)) {
                setStyle(child, 'display', 'none');
            } else {
                // If it's an ancestor or the canvas itself, ensure it's visible
                // and remove any transformations that might affect its position for capture
                let current = child;
                while (current && current !== document.body) {
                    setStyle(current, 'display', 'block'); // Or initial, or revert to original display
                    setStyle(current, 'transform', 'none');
                    setStyle(current, 'position', 'static'); // Temporarily make static if it helps isolate
                    if (current === canvas.parentElement) {
                         setStyle(current, 'position', 'relative'); // Ensure parent is relative for absolute children if any
                    }
                    current = current.parentElement;
                }
            }
        });
        // Ensure the canvas itself is correctly positioned and sized for capture
        setStyle(canvas, 'position', 'absolute'); 
        setStyle(canvas, 'top', '0px');
        setStyle(canvas, 'left', '0px');
        setStyle(canvas, 'margin', '0');
        setStyle(canvas, 'transform', 'none'); // Remove any transforms
        
        // Ensure body and html have no margin/padding that could offset the canvas
        setStyle(document.body, 'margin', '0');
        setStyle(document.body, 'padding', '0');
        setStyle(document.documentElement, 'margin', '0');
        setStyle(document.documentElement, 'padding', '0');
    });
    console.log('[Puppeteer] Temporarily hid non-canvas elements.');

    // Get the exact bounding box of the comic-canvas AFTER applying styles
      const boundingBox = await page.evaluate(() => {
        const canvas = document.querySelector('#comic-canvas');
        if (!canvas) return null;
        // Force a reflow to ensure styles are applied and dimensions are correct
        canvas.offsetHeight;
        const rect = canvas.getBoundingClientRect();
        return {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
            width: Math.round(rect.width), // Use the actual rendered width of the canvas
            height: Math.round(rect.height), // Use the actual rendered height of the canvas
            // actualWidth: Math.round(rect.width), // Redundant now
            // actualHeight: Math.round(rect.height) // Redundant now
        };
      });

      if (!boundingBox) {
        console.error('[Puppeteer] Could not find #comic-canvas for bounding box after style changes.');
        // Attempt to restore styles before throwing error
        await page.evaluate(() => { /* ... style restoration logic ... */ });
        throw new Error('Could not find #comic-canvas for screenshot bounding box.');
      }
    console.log(`[Puppeteer] Canvas bounding box for PDF: x=${boundingBox.x}, y=${boundingBox.y}, width=${boundingBox.width}, height=${boundingBox.height}. Actual on-page w/h: ${boundingBox.width}x${boundingBox.height}`);

    // const tempImageDir = path.join(outputDirectory, 'temp_export_images'); // Not used for PDF
    // await fs.mkdir(tempImageDir, { recursive: true }); // Not used for PDF

    // console.log('[Puppeteer] Generating PDF for #comic-canvas...'); // Old log
    // await page.pdf({ // OLD METHOD
    //     path: outputPdfPath,
    //     // format: 'A4', // Remove format to use width/height
    //     printBackground: true,
    //     width: `${boundingBox.width}px`, // Use canvas width
    //     height: `${boundingBox.height}px`, // Use canvas height
    //     margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    //     scale: 1,
    //     clip: {
    //         x: boundingBox.x,
    //         y: boundingBox.y,
    //         width: boundingBox.width,
    //         height: boundingBox.height
    //     },
    //     timeout: 120000
    // });
    // console.log(`[Puppeteer] PDF for current page's canvas exported successfully to ${outputPdfPath}`); // Old log

    console.log('[Puppeteer] Taking screenshot of #comic-canvas...');
    const pngScreenshotBuffer = await page.screenshot({
        clip: {
            x: boundingBox.x,
            y: boundingBox.y,
            width: boundingBox.width, // Use calculated boundingBox width for the clip
            height: boundingBox.height // Use calculated boundingBox height for the clip
        },
        type: 'png',
        omitBackground: false // Set to false to include canvas background; true if it should be transparent and handled by PDF bg
    });
    console.log('[Puppeteer] Screenshot taken.');

    console.log('[Puppeteer] Creating PDF with embedded screenshot...');
    const pdfDoc = await PDFDocument.create();
    let pdfPageWidth = projectState.canvasWidth || 700; // Fallback if undefined
    let pdfPageHeight = projectState.canvasHeight || 700; // Fallback if undefined

    console.log(`[Puppeteer] PDF Page Dimensions: Width=${pdfPageWidth}, Height=${pdfPageHeight}`);

    const pageOfPdf = pdfDoc.addPage([pdfPageWidth, pdfPageHeight]);
    
    const pngImage = await pdfDoc.embedPng(pngScreenshotBuffer);

    // Draw the image to fill the PDF page. 
    // The image itself was clipped to the canvas dimensions.
    pageOfPdf.drawImage(pngImage, {
        x: 0,
        y: 0, 
        width: pdfPageWidth,  // Scale image to fill the PDF page width
        height: pdfPageHeight, // Scale image to fill the PDF page height
    });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPdfPath, pdfBytes);
    console.log(`[Puppeteer] PDF with screenshot for current page saved to ${outputPdfPath}`);


    // Restore visibility of hidden elements
    await page.evaluate(() => {
        const elementsWithOriginalStyle = document.querySelectorAll('[data-original-inline-style]');
        elementsWithOriginalStyle.forEach(el => {
            el.setAttribute('style', el.dataset.originalInlineStyle);
            el.removeAttribute('data-original-inline-style');
        });
        // Also restore body and html if modified directly and not via dataset
        document.body.style.margin = ''; 
        document.body.style.padding = ''; 
        document.documentElement.style.margin = '';
        document.documentElement.style.padding = '';

    });
    console.log('[Puppeteer] Restored non-canvas element visibility.');

    return outputPdfPath;

  } catch (error) {
    console.error('[Puppeteer] Error during export:', error);
    try {
      if (page && !page.isClosed()) {
      const errorScreenshot = await page.screenshot({ fullPage: true });
      const errorScreenshotPath = path.join(outputDirectory, 'error-screenshot.png');
      await fs.writeFile(errorScreenshotPath, errorScreenshot);
      console.log(`[Puppeteer] Error screenshot saved to: ${errorScreenshotPath}`);
      } else {
        console.log('[Puppeteer] Could not save error screenshot because page was closed or undefined.');
      }
    } catch (screenshotError) {
      console.error('[Puppeteer] Failed to save error screenshot:', screenshotError);
    }
    throw error;
  } finally {
    if (browser) {
      console.log('[Puppeteer] Closing browser...');
    await browser.close();
      console.log('[Puppeteer] Browser closed.');
  }
}
}

async function mergePdfs(pdfFilePaths, finalOutputPath) {
    console.log(`[PDFMerge] Starting to merge ${pdfFilePaths.length} PDF files into ${finalOutputPath}`);
    const mergedPdf = await PDFDocument.create();
    for (const filePath of pdfFilePaths) {
        try {
            console.log(`[PDFMerge] Reading PDF: ${filePath}`);
            const pdfBytes = await fs.readFile(filePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => {
                mergedPdf.addPage(page);
                console.log(`[PDFMerge] Added page from ${filePath}`);
            });
        } catch (err) {
            console.error(`[PDFMerge] Error processing file ${filePath}:`, err);
            // Optionally, decide if one failed page should stop the whole process
        }
    }
    const mergedPdfBytes = await mergedPdf.save();
    await fs.writeFile(finalOutputPath, mergedPdfBytes);
    console.log(`[PDFMerge] Merged PDF saved successfully to ${finalOutputPath}`);
}


// Your Express router POST handler
// Make sure this is how your router is defined. If it's app.post, use that.
// Example: const router = express.Router();
// router.post('/api/export-pdf', async (req, res) => { ... });
// Or if it's directly on the app:
// app.post('/api/export-pdf', async (req, res) => { ... });
// For this example, I'll assume it's part of a router object passed to this module.

export default function configurePuppeteerExport(router, comicCreatorUrl, outputDirBase) {

    router.post('/export-pdf', async (req, res) => {
        console.log('[Vite Server/PuppeteerModule] Received POST request for /export-pdf');
        const projectState = req.body;
        const jobId = uuidv4();
        const exportTimestamp = Date.now(); // Keep for unique folder naming
        const jobOutputDir = path.join(outputDirBase, `export_${exportTimestamp}_${jobId}`); // Add jobId for more uniqueness
        const tempPdfDir = path.join(jobOutputDir, 'temp_pages');

        if (!projectState || !projectState.pages || projectState.pages.length === 0) {
            console.error('[Vite Server] Invalid or empty project state received.');
            return res.status(400).send('Invalid or empty project state.');
        }
        
        const totalPages = projectState.pages.length;
        exportJobs[jobId] = {
            id: jobId,
            status: 'starting',
            currentPage: 0,
            totalPages: totalPages,
            finalPdfPath: null,
            compressedPdfPath: null, // Add compressed PDF path
            compressionInfo: null, // Add compression statistics
            jobOutputDir: jobOutputDir, // Store for potential cleanup
            error: null,
            lastUpdated: Date.now()
        };

        console.log(`[Vite Server] Job ${jobId} created. Total pages: ${totalPages}. Output dir: ${jobOutputDir}`);
        // Respond to the client immediately that the job has started
        res.status(202).json({ 
            jobId: jobId,
            message: 'PDF export process started.',
            totalPages: totalPages 
        });

        // Perform the PDF generation asynchronously
        (async () => {
            try {
                exportJobs[jobId].status = 'processing';
                exportJobs[jobId].lastUpdated = Date.now();
                await fs.ensureDir(tempPdfDir);
                console.log(`[Vite Server Job ${jobId}] Temporary directory for PDF pages: ${tempPdfDir}`);
                
                const individualPdfPaths = [];

                for (let i = 0; i < totalPages; i++) {
                    exportJobs[jobId].currentPage = i + 1;
                    exportJobs[jobId].lastUpdated = Date.now();
                    console.log(`[Vite Server Job ${jobId}] Processing page ${i + 1} of ${totalPages}...`);
                    
                    const singlePageProjectState = createSinglePageProjectState(projectState, i);
                    const tempPdfPath = path.join(tempPdfDir, `page_${i + 1}.pdf`);

                    console.log(`[Vite Server Job ${jobId}] Calling capturePageAsImage for page ${i + 1}... Output: ${tempPdfPath}`);
                    await capturePageAsImage(comicCreatorUrl, jobOutputDir, singlePageProjectState, tempPdfPath);
                    individualPdfPaths.push(tempPdfPath);
                    console.log(`[Vite Server Job ${jobId}] Successfully captured page ${i + 1} to ${tempPdfPath}`);
                }

                console.log(`[Vite Server Job ${jobId}] All pages processed. Starting PDF merge...`);
                const finalPdfPath = path.join(jobOutputDir, `comic_export_${exportTimestamp}.pdf`);
                await mergePdfs(individualPdfPaths, finalPdfPath);
                console.log(`[Vite Server Job ${jobId}] Final PDF merged and saved to ${finalPdfPath}`);

                // Check if compression is requested
                const shouldCompress = projectState.shouldCompress !== undefined ? projectState.shouldCompress : true; // Default to true if not specified

                if (shouldCompress) {
                    console.log(`[Vite Server Job ${jobId}] Compression requested. Starting PDF compression...`);
                    exportJobs[jobId].status = 'compressing';
                    exportJobs[jobId].lastUpdated = Date.now();
                    
                    const compressedPdfPath = path.join(jobOutputDir, `comic_export_compressed_${exportTimestamp}.pdf`);
                    const compressionOptions = { 
                        compression_level: projectState.settings?.pdfExport?.compressionLevel || 'recommended' 
                    }; 
                    console.log(`[Vite Server Job ${jobId}] Using compression options:`, compressionOptions);

                    const compressionResult = await pdfCompressionService.compressPDF(
                        finalPdfPath, 
                        compressedPdfPath,
                        compressionOptions
                    );
                    
                    exportJobs[jobId].compressionInfo = {
                        success: compressionResult.success,
                        originalSize: compressionResult.originalSize,
                        compressedSize: compressionResult.compressedSize,
                        compressionRatio: compressionResult.compressionRatio,
                        error: compressionResult.error,
                        fallback_used: !!compressionResult.fallback_used,
                        fallback_failed: !!compressionResult.fallback_failed,
                        fallback_impossible: !!compressionResult.fallback_impossible,
                        skipped: false
                    };

                    if (compressionResult.success) {
                        exportJobs[jobId].finalPdfPath = compressedPdfPath;
                        console.log(`[Vite Server Job ${jobId}] PDF compression successful. Compressed file: ${compressedPdfPath}`);
                    } else if (compressionResult.fallback_used) {
                        exportJobs[jobId].finalPdfPath = compressedPdfPath;
                        console.warn(`[Vite Server Job ${jobId}] PDF compression failed, but fallback to original file was successful. Path: ${compressedPdfPath}. Reason: ${compressionResult.error}`);
                    } else {
                        exportJobs[jobId].finalPdfPath = finalPdfPath;
                        const criticalErrorMsg = `PDF compression failed critically: ${compressionResult.error}. Fallback impossible: ${!!compressionResult.fallback_impossible}, Fallback failed: ${!!compressionResult.fallback_failed}.`;
                        console.error(`[Vite Server Job ${jobId}] ${criticalErrorMsg}`);
                        exportJobs[jobId].status = 'error';
                        exportJobs[jobId].error = criticalErrorMsg;
                    }
                } else {
                    console.log(`[Vite Server Job ${jobId}] Compression skipped by user.`);
                    exportJobs[jobId].finalPdfPath = finalPdfPath; // Use the uncompressed path
                    exportJobs[jobId].compressionInfo = {
                        success: true, // Considered success as no compression was attempted
                        skipped: true,
                        originalSize: await fs.stat(finalPdfPath).then(stat => stat.size).catch(() => 0),
                        compressedSize: await fs.stat(finalPdfPath).then(stat => stat.size).catch(() => 0),
                        compressionRatio: "0.00",
                        error: null
                    };
                    // No change to status, will proceed to complete directly
                }
                
                // Only set to complete if not already in an error state from critical compression failure
                if (exportJobs[jobId].status !== 'error') {
                    exportJobs[jobId].status = 'complete';
                    console.log(`[Vite Server Job ${jobId}] PDF processing (including compression attempt) completed.`);
                } else {
                    console.error(`[Vite Server Job ${jobId}] Job finished with an error state due to compression issues.`);
                }
                exportJobs[jobId].lastUpdated = Date.now();

                // Optionally clean up temporary individual PDF files after a short delay
                setTimeout(async () => {
                    try {
                        if (await fs.pathExists(tempPdfDir)) {
                            await fs.remove(tempPdfDir);
                            console.log(`[Vite Server Job ${jobId}] Cleaned up temporary PDF pages directory ${tempPdfDir}`);
                        }
                    } catch (cleanupError) {
                        console.error(`[Vite Server Job ${jobId}] Error cleaning up temporary PDF pages directory ${tempPdfDir}:`, cleanupError);
                    }
                }, 30000); // 30 seconds delay

            } catch (error) {
                console.error(`[Vite Server Job ${jobId}] Error processing export:`, error);
                exportJobs[jobId].status = 'error';
                exportJobs[jobId].error = error.message || 'Unknown export error';
                exportJobs[jobId].lastUpdated = Date.now();
                // Cleanup jobOutputDir on error (optional, might want to keep for debugging)
                // try {
                //     if (await fs.pathExists(jobOutputDir)) {
                //         await fs.remove(jobOutputDir);
                //         console.log(`[Vite Server Job ${jobId}] Cleaned up job output directory due to error: ${jobOutputDir}`);
                //     }
                // } catch (cleanupError) {
                //     console.error(`[Vite Server Job ${jobId}] Error cleaning up job output directory ${jobOutputDir} after main error:`, cleanupError);
                // }
            }
        })(); // Immediately invoke the async function
    });

    // New endpoint to get progress
    router.get('/export-progress/:jobId', (req, res) => {
        const jobId = req.params.jobId;
        const job = exportJobs[jobId];

        if (job) {
            res.json({
                jobId: job.id,
                status: job.status,
                currentPage: job.currentPage,
                totalPages: job.totalPages,
                finalPdfPath: job.finalPdfPath, // Will be null until complete or point to compressed/original
                // Ensure all relevant fields from job.compressionInfo are passed
                compressionInfo: job.compressionInfo ? {
                    success: job.compressionInfo.success,
                    originalSize: job.compressionInfo.originalSize,
                    compressedSize: job.compressionInfo.compressedSize,
                    compressionRatio: job.compressionInfo.compressionRatio,
                    error: job.compressionInfo.error,
                    fallback_used: job.compressionInfo.fallback_used,
                    fallback_failed: job.compressionInfo.fallback_failed,
                    fallback_impossible: job.compressionInfo.fallback_impossible
                } : null,
                error: job.error
            });
        } else {
            res.status(404).send('Job not found.');
        }
    });

    // New endpoint to download the PDF
    router.get('/download-pdf/:jobId', async (req, res) => {
        const jobId = req.params.jobId;
        const job = exportJobs[jobId];

        if (job && job.status === 'complete' && job.finalPdfPath) {
            if (await fs.pathExists(job.finalPdfPath)) {
                res.setHeader('Content-Type', 'application/pdf');
                const filename = path.basename(job.finalPdfPath);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                const pdfFileStream = fs.createReadStream(job.finalPdfPath);
                
                pdfFileStream.pipe(res);
                pdfFileStream.on('error', (err) => {
                    console.error(`[Vite Server Job ${jobId}] Error streaming PDF to client:`, err);
                    if (!res.headersSent) {
                        res.status(500).send('Error streaming PDF.');
                    }
                });
                // Note: We might not clean up jobOutputDir immediately here, 
                // as the job cleanup interval will handle it, or another mechanism.
            } else {
                console.error(`[Vite Server Job ${jobId}] Final PDF not found at path: ${job.finalPdfPath}`);
                res.status(404).send('PDF file not found. It might have been cleaned up or an error occurred.');
                 exportJobs[jobId].status = 'error'; // Mark as error if file is gone
                 exportJobs[jobId].error = 'PDF file not found, possibly cleaned up.';
                 exportJobs[jobId].lastUpdated = Date.now();
            }
        } else if (job) {
            res.status(400).json({ message: 'Job not yet complete or has an error.', status: job.status, error: job.error });
        } else {
            res.status(404).send('Job not found.');
        }
    });
};