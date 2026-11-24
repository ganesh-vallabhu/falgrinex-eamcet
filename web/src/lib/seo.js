import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const SITE_URL = 'https://falgrinex-study.web.app';
export const SITE_NAME = 'Falgrinex EAMCET';
export const SITE_DESCRIPTION = 'Free AP EAMCET preparation with 24,000+ chapter-wise practice questions, timed mock tests, grand tests, a daily challenge and detailed performance analytics for Mathematics, Physics and Chemistry.';

const pages = {
  '/': {
    title: 'Falgrinex EAMCET — AP EAMCET Practice & Mock Tests',
    description: SITE_DESCRIPTION,
    index: true,
  },
  '/login': {
    title: 'Student Login',
    description: 'Sign in to your Falgrinex EAMCET account to continue chapter-wise practice, mock tests and progress tracking.',
  },
  '/set-password': {
    title: 'Set Password',
    description: 'Set your Falgrinex EAMCET account password to access your practice dashboard.',
  },
  '/app': {
    title: 'Dashboard',
    description: 'Your Falgrinex EAMCET practice dashboard with daily challenges, accuracy trends and recent activity.',
  },
  '/app/subjects': {
    title: 'Subjects & Chapters',
    description: 'Browse Mathematics, Physics and Chemistry chapters and start focused AP EAMCET practice.',
  },
  '/app/tests': {
    title: 'Mock & Grand Tests',
    description: 'Take timed AP EAMCET mock tests, grand tests and chapter tests with instant feedback.',
  },
  '/app/resources': {
    title: 'Study Resources',
    description: 'Notes, links and updates shared by mentors for AP EAMCET preparation.',
  },
  '/app/leaderboard': {
    title: 'Leaderboard',
    description: 'Weekly and overall rankings for Falgrinex EAMCET students.',
  },
  '/app/profile': {
    title: 'My Profile',
    description: 'Manage your Falgrinex EAMCET student profile and practice preferences.',
  },
  '/app/admin': {
    title: 'Admin',
    description: 'Falgrinex EAMCET administration area.',
  },
};

const patterns = [
  { prefix: '/app/practice/', title: 'Practice Questions', description: 'Practice AP EAMCET questions by chapter, topic and difficulty with instant explanations.' },
  { prefix: '/app/test/', title: 'Timed Test', description: 'Attempt a timed Falgrinex EAMCET test and review your answers.' },
  { prefix: '/app/result/', title: 'Test Result', description: 'Review your Falgrinex EAMCET test result, accuracy and explanations.' },
];

function pageSeo(pathname) {
  if (pages[pathname]) return pages[pathname];
  const match = patterns.find((item) => pathname.startsWith(item.prefix));
  if (match) return match;
  return { title: 'Page Not Found', description: 'The page you were looking for could not be found on Falgrinex EAMCET.' };
}

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

export function useRouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = pageSeo(pathname);
    const title = pathname === '/' ? page.title : `${page.title} | ${SITE_NAME}`;
    const canonical = pathname === '/' ? `${SITE_URL}/` : `${SITE_URL}/#${pathname}`;
    const robots = page.index ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, nofollow';

    document.title = title;
    setMeta('name', 'description', page.description);
    setMeta('name', 'robots', robots);
    setMeta('name', 'googlebot', robots);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', page.description);
    setMeta('property', 'og:url', canonical);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', page.description);

    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);
  }, [pathname]);
}
