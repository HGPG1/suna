import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale, type Locale } from '@/i18n/config';
import { detectBestLocaleFromHeaders } from '@/lib/utils/geo-detection-server';

// Marketing pages that support locale routing for SEO (/de, /it, etc.)
const MARKETING_ROUTES = [
  '/',
  '/suna',
  '/legal',
  '/support',
  '/templates',
];

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/', // Homepage should be public!
  '/auth',
  '/auth/callback',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/legal',
  '/api/auth',
  '/share', // Shared content should be public
  '/templates', // Template pages should be public
  '/master-login', // Master password admin login
  '/checkout', // Public checkout wrapper for Apple compliance
  '/support', // Support page should be public
  '/suna', // Kortix rebrand page should be public for SEO
  '/help', // Help center and documentation should be public
  '/credits-explained', // Credits explained page should be public
  '/agents-101',
  '/about', // About page should be public 
  '/milano', // Milano page should be public
  '/berlin', // Berlin page should be public
  '/app', // App download page should be public,
  '/careers',
  '/pricing', // Pricing page should be public
  '/tutorials', // Tutorials page should be public
  '/countryerror', // Country restriction error page should be public
  ...locales.flatMap(locale => MARKETING_ROUTES.map(route => `/${locale}${route === '/' ? '' : route}`)),
];

// Routes that require authentication but are related to billing/trials/setup
const BILLING_ROUTES = [
  '/activate-trial',
  '/subscription',
  '/setting-up',
];

// Routes that require authentication and active subscription
const PROTECTED_ROUTES = [
  '/dashboard',
  '/agents',
  '/projects',
  '/settings',
];

// App store links for mobile redirect
const APP_STORE_LINKS = {
  ios: 'https://apps.apple.com/ie/app/kortix/id6754448524',
  android: 'https://play.google.com/store/apps/details?id=com.kortix.app',
};

// Detect mobile platform from User-Agent header (edge-optimized )
function detectMobilePlatformFromUA(userAgent: string | null): 'ios' | 'android' | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return null;
}

// HTTP Basic Authentication - runs before all other middleware logic
function checkBasicAuth(request: NextRequest): NextResponse | null {
  const basicAuthEnabled = process.env.BASIC_AUTH_ENABLED === 'true';
  if (!basicAuthEnabled) return null;

  // Always allow /health endpoint for Railway healthchecks
  if (request.nextUrl.pathname === '/health') return null;

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const [username, password] = decoded.split(':');
      const expectedUser = process.env.BASIC_AUTH_USER || '';
      const expectedPass = process.env.BASIC_AUTH_PASSWORD || '';
      if (username === expectedUser && password === expectedPass) {
        return null; // Auth passed, continue
      }
    }
  }

  // Auth failed or missing — return 401 with WWW-Authenticate header
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Suna AI", charset="UTF-8"',
    },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // HTTP Basic Auth check — must pass before anything else
  const authResponse = checkBasicAuth(request);
  if (authResponse) return authResponse;
  
  // 🚀 HYPER-FAST: Mobile app store redirect for /milano, /berlin, and /app
  // This runs at the edge before ANY page rendering
  if (pathname === '/milano' || pathname === '/berlin' || pathname === '/app') {
    const userAgent = request.headers.get('user-agent');
    const platform = detectMobilePlatformFromUA(userAgent);
    
    if (platform) {
      // Instant 302 redirect to app store - no page load needed
      return NextResponse.redirect(APP_STORE_LINKS[platform], { status: 302 });
    }
    // Desktop users continue to the full page
  }

  // Block access to WIP /thread/new route - redirect to dashboard
  if (pathname.includes('/thread/new')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') ||
    pathname.startsWith('/api/')
  ) {
    return NextResponse.next();
  }

  // 🏠 LOCAL/SELF-HOSTED MODE: Skip all auth and billing checks entirely
  const isLocalMode = process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'local';
  if (isLocalMode) {
    return NextResponse.next();
  }

  // Handle Supabase verification redirects at root level
  if (pathname === '/' || pathname === '') {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    const error = searchParams.get('error');
    
    if (code || token || type || error) {
      const callbackUrl = new URL('/auth/callback', request.url);
      searchParams.forEach((value, key) => {
        callbackUrl.searchParams.set(key, value);
      });
      console.log('🔄 Redirecting Supabase verification from root to /auth/callback');
      return NextResponse.redirect(callbackUrl);
    }
  }

  const pathSegments = pathname.split('/').filter(Boolean);
  const firstSegment = pathSegments[0];
  
  if (firstSegment && locales.includes(firstSegment as Locale)) {
    const locale = firstSegment as Locale;
    const remainingPath = '/' + pathSegments.slice(1).join('/') || '/';
    
    const isRemainingPathMarketing = MARKETING_ROUTES.some(route => {
      if (route === '/') {
        return remainingPath === '/' || remainingPath === '';
      }
      return remainingPath === route || remainingPath.startsWith(route + '/');
    });
    
    if (isRemainingPathMarketing) {
      const response = NextResponse.rewrite(new URL(remainingPath, request.url));
      response.cookies.set('locale', locale, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
      });
      response.headers.set('x-locale', locale);
      return response;
    }
  }
  
  const isMarketingRoute = MARKETING_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user: { id: string; user_metadata?: { locale?: string } } | null = null;
  let authError: Error | null = null;
  
  try {
    const { data: { user: fetchedUser }, error: fetchedError } = await supabase.auth.getUser();
    user = fetchedUser;
    authError = fetchedError as Error | null;
  } catch (error) {
    authError = error as Error;
  }

  if (isMarketingRoute && (!firstSegment || !locales.includes(firstSegment as Locale))) {
    const localeCookie = request.cookies.get('locale')?.value;
    const hasExplicitPreference = !!localeCookie && locales.includes(localeCookie as Locale);
    
    let userLocale: Locale | null = null;
    if (!hasExplicitPreference && user?.user_metadata?.locale && locales.includes(user.user_metadata.locale as Locale)) {
      userLocale = user.user_metadata.locale as Locale;
    }
    
    if (!hasExplicitPreference && !userLocale) {
      const acceptLanguage = request.headers.get('accept-language');
      const detectedLocale = detectBestLocaleFromHeaders(acceptLanguage);
      
      if (detectedLocale !== defaultLocale) {
        const redirectUrl = new URL(request.url);
        redirectUrl.pathname = `/${detectedLocale}${pathname === '/' ? '' : pathname}`;
        
        const redirectResponse = NextResponse.redirect(redirectUrl);
        redirectResponse.cookies.set('locale', detectedLocale, {
          path: '/',
          maxAge: 31536000,
          sameSite: 'lax',
        });
        return redirectResponse;
      }
    }
  }

  if (PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  try {
    if (authError || !user) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    if (BILLING_ROUTES.some(route => pathname.startsWith(route))) {
      return supabaseResponse;
    }

    if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
      const { data: accounts } = await supabase
        .schema('basejump')
        .from('accounts')
        .select('id')
        .eq('personal_account', true)
        .eq('primary_owner_user_id', user.id)
        .single();

      if (!accounts) {
        const url = request.nextUrl.clone();
        url.pathname = '/activate-trial';
        return NextResponse.redirect(url);
      }

      const accountId = accounts.id;
      const { data: creditAccount } = await supabase
        .from('credit_accounts')
        .select('tier, trial_status, trial_ends_at')
        .eq('account_id', accountId)
        .single();

      const { data: trialHistory } = await supabase
        .from('trial_history')
        .select('id')
        .eq('account_id', accountId)
        .single();

      const hasUsedTrial = !!trialHistory;

      if (!creditAccount) {
        if (hasUsedTrial) {
          const url = request.nextUrl.clone();
          url.pathname = '/subscription';
          return NextResponse.redirect(url);
        } else {
          const url = request.nextUrl.clone();
          url.pathname = '/activate-trial';
          return NextResponse.redirect(url);
        }
      }

      const hasPaidTier = creditAccount.tier && creditAccount.tier !== 'none' && creditAccount.tier !== 'free';
      const hasFreeTier = creditAccount.tier === 'free';
      const hasActiveTrial = creditAccount.trial_status === 'active';
      const trialExpired = creditAccount.trial_status === 'expired' || creditAccount.trial_status === 'cancelled';
      const trialConverted = creditAccount.trial_status === 'converted';
      
      const subscriptionSuccess = request.nextUrl.searchParams.get('subscription') === 'success';
      if (subscriptionSuccess && pathname === '/dashboard') {
        return supabaseResponse;
      }
      
      if (hasPaidTier || hasFreeTier) {
        return supabaseResponse;
      }

      if (!hasPaidTier && !hasFreeTier && !hasActiveTrial && !trialConverted) {
        const url = request.nextUrl.clone();
        url.pathname = '/subscription';
        return NextResponse.redirect(url);
      } else if ((trialExpired || trialConverted) && !hasPaidTier && !hasFreeTier) {
        const url = request.nextUrl.clone();
        url.pathname = '/subscription';
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
  } catch (error) {
    console.error('Middleware error:', error);
    return supabaseResponse;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
