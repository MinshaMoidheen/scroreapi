import puppeteer, { Browser, LaunchOptions } from 'puppeteer';
import os from 'os';
import fs from 'fs';
import path from 'path';

function resolveWindowsChromePaths(): string[] {
  const possiblePaths: string[] = [];
  const programFiles = process.env["PROGRAMFILES"] || 'C:/Program Files';
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] || 'C:/Program Files (x86)';
  const localAppData = process.env["LOCALAPPDATA"]; // e.g. C:\Users\<User>\AppData\Local

  possiblePaths.push(
    path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
    path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe')
  );

  if (localAppData) {
    possiblePaths.push(
      path.join(localAppData, 'Google/Chrome/Application/chrome.exe')
    );
  }

  return possiblePaths.filter(p => fs.existsSync(p));
}

export async function launchPuppeteer(extra?: LaunchOptions): Promise<Browser> {
  const headless = true;

  // 1) Respect explicit executable path via env override
  const envExecutable = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.PUPPETEER_CHROMIUM_EXECUTABLE_PATH;
  const commonArgs = ['--no-sandbox', '--disable-setuid-sandbox'];

  if (envExecutable && fs.existsSync(envExecutable)) {
    return puppeteer.launch({
      headless,
      executablePath: envExecutable,
      args: commonArgs,
      ...extra,
    });
  }

  // 2) Try Chrome channel (uses system Chrome if available)
  try {
    return await puppeteer.launch({
      headless,
      channel: 'chrome',
      args: commonArgs,
      ...extra,
    } as LaunchOptions & { channel: 'chrome' });
  } catch (e) {
    // continue to next strategy
  }

  // 3) On Windows, try common install paths
  if (os.platform() === 'win32') {
    const candidates = resolveWindowsChromePaths();
    for (const candidate of candidates) {
      try {
        return await puppeteer.launch({
          headless,
          executablePath: candidate,
          args: commonArgs,
          ...extra,
        });
      } catch (e) {
        // try next
      }
    }
  }

  // 4) Fallback to bundled Chromium (requires `npx puppeteer browsers install chrome` or chromium cache)
  // puppeteer will pick its default executable if none provided
  return puppeteer.launch({
    headless,
    args: commonArgs,
    ...extra,
  });
}


