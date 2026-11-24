import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, useRouteSeo } from './seo.js';

const selectors = [
  'meta[name="description"]',
  'meta[name="robots"]',
  'meta[name="googlebot"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:url"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'link[rel="canonical"]',
];

function clearHead() {
  for (const selector of selectors) {
    document.head.querySelectorAll(selector).forEach((element) => element.remove());
  }
  document.title = '';
}

function meta(attribute, key) {
  return document.head.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute('content');
}

function canonical() {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
}

function renderSeo(path) {
  return renderHook(() => useRouteSeo(), {
    wrapper: ({ children }) => createElement(MemoryRouter, { initialEntries: [path] }, children),
  });
}

describe('useRouteSeo', () => {
  beforeEach(clearHead);
  afterEach(clearHead);

  it('sets indexable metadata for the home route', () => {
    const { unmount } = renderSeo('/');

    expect(document.title).toBe('Falgrinex EAMCET — AP EAMCET Practice & Mock Tests');
    expect(meta('name', 'description')).toBe(SITE_DESCRIPTION);
    expect(canonical()).toBe(`${SITE_URL}/`);
    expect(meta('name', 'robots')).toBe('index, follow, max-image-preview:large, max-snippet:-1');
    expect(meta('name', 'googlebot')).toBe(meta('name', 'robots'));
    expect(meta('property', 'og:url')).toBe(`${SITE_URL}/`);
    unmount();
  });

  it('sets non-indexable metadata for the login route', () => {
    const { unmount } = renderSeo('/login');

    expect(document.title).toBe(`Student Login | ${SITE_NAME}`);
    expect(meta('name', 'description')).toBe('Sign in to your Falgrinex EAMCET account to continue chapter-wise practice, mock tests and progress tracking.');
    expect(canonical()).toBe(`${SITE_URL}/#/login`);
    expect(meta('name', 'robots')).toBe('noindex, nofollow');
    expect(meta('name', 'googlebot')).toBe('noindex, nofollow');
    unmount();
  });

  it('sets non-indexable metadata for the subjects route', () => {
    const { unmount } = renderSeo('/app/subjects');

    expect(document.title).toBe(`Subjects & Chapters | ${SITE_NAME}`);
    expect(meta('name', 'description')).toBe('Browse Mathematics, Physics and Chemistry chapters and start focused AP EAMCET practice.');
    expect(canonical()).toBe(`${SITE_URL}/#/app/subjects`);
    expect(meta('name', 'robots')).toBe('noindex, nofollow');
    expect(meta('name', 'googlebot')).toBe('noindex, nofollow');
    unmount();
  });

  it('sets not-found metadata for an unknown route', () => {
    const { unmount } = renderSeo('/no-such-page');

    expect(document.title).toBe(`Page Not Found | ${SITE_NAME}`);
    expect(meta('name', 'description')).toBe('The page you were looking for could not be found on Falgrinex EAMCET.');
    expect(canonical()).toBe(`${SITE_URL}/#/no-such-page`);
    expect(meta('name', 'robots')).toBe('noindex, nofollow');
    expect(meta('name', 'googlebot')).toBe('noindex, nofollow');
    unmount();
  });
});
