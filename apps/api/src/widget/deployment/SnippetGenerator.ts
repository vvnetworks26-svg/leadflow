/**
 * SnippetGenerator.ts
 *
 * Generates framework-specific installation snippets for the widget.
 * Supports: HTML, React, Next.js, Vue, Angular, WordPress, Shopify,
 *           Webflow, Wix, Squarespace, plain JavaScript.
 */

export type SnippetPlatform =
  | 'html' | 'react' | 'nextjs' | 'vue' | 'angular'
  | 'wordpress' | 'shopify' | 'webflow' | 'wix' | 'squarespace' | 'javascript';

export interface SnippetOptions {
  organizationSlug: string;
  widgetVersion?:   string;
  cdnBase?:         string;
}

const DEFAULT_CDN = 'https://cdn.leadflow.app';

function scriptTag(opts: SnippetOptions): string {
  const cdn = opts.cdnBase ?? DEFAULT_CDN;
  const ver = opts.widgetVersion ?? 'latest';
  return `<script src="${cdn}/widget/${ver}/widget.js" data-business="${opts.organizationSlug}" defer></script>`;
}

export function generateSnippet(platform: SnippetPlatform, opts: SnippetOptions): string {
  const cdn  = opts.cdnBase ?? DEFAULT_CDN;
  const ver  = opts.widgetVersion ?? 'latest';
  const slug = opts.organizationSlug;

  switch (platform) {
    case 'html':
    case 'javascript':
      return `<!-- LeadFlow Widget -->
${scriptTag(opts)}
<!-- End LeadFlow Widget -->`;

    case 'react':
      return `// components/LeadFlowWidget.tsx
import { useEffect } from 'react';

export default function LeadFlowWidget() {
  useEffect(() => {
    const script   = document.createElement('script');
    script.src     = '${cdn}/widget/${ver}/widget.js';
    script.defer   = true;
    script.dataset.business = '${slug}';
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);
  return null;
}

// Add to your _app.tsx or layout:
// import LeadFlowWidget from './components/LeadFlowWidget';
// <LeadFlowWidget />`;

    case 'nextjs':
      return `// app/layout.tsx (App Router) or pages/_app.tsx (Pages Router)
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Script
          src="${cdn}/widget/${ver}/widget.js"
          data-business="${slug}"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}`;

    case 'vue':
      return `<!-- plugins/leadflow.client.ts (Nuxt 3) or main.ts (Vue 3) -->
// Add to your index.html or mount point:
<script src="${cdn}/widget/${ver}/widget.js" data-business="${slug}" defer></script>

// Or programmatically in Vue 3:
// app.config.globalProperties.$leadflow = window.__LEADFLOW__;
// mounted() { ... }`;

    case 'angular':
      return `// angular.json — add to scripts array:
"scripts": [
  {
    "input": "${cdn}/widget/${ver}/widget.js",
    "bundleName": "leadflow-widget",
    "inject": false
  }
]

// In your index.html <head>:
<script>window.LEADFLOW_BUSINESS = '${slug}';</script>

// In app.component.ts:
// declare const window: any;
// ngOnInit() { window.__LEADFLOW__?.initialize({ businessId: '${slug}', ... }); }`;

    case 'wordpress':
      return `<?php
// Add to your theme's functions.php:
function leadflow_widget_script() {
  wp_enqueue_script(
    'leadflow-widget',
    '${cdn}/widget/${ver}/widget.js',
    array(),
    '${ver}',
    true
  );
  wp_script_add_data( 'leadflow-widget', 'data-business', '${slug}' );
}
add_action( 'wp_enqueue_scripts', 'leadflow_widget_script' );
?>

<!-- Or add directly to footer.php before </body>: -->
${scriptTag(opts)}`;

    case 'shopify':
      return `{% comment %} Add to theme.liquid before </body>: {% endcomment %}
${scriptTag(opts)}

{% comment %}
Alternatively, use Shopify Admin → Online Store → Themes → Edit code
→ theme.liquid → paste before </body>
{% endcomment %}`;

    case 'webflow':
      return `<!-- Webflow: Site Settings → Custom Code → Footer Code -->
${scriptTag(opts)}`;

    case 'wix':
      return `/* Wix: Add Custom Code (Settings → Custom Code → Add Code → Body - end) */
${scriptTag(opts)}`;

    case 'squarespace':
      return `<!-- Squarespace: Settings → Advanced → Code Injection → Footer -->
${scriptTag(opts)}`;

    default:
      return scriptTag(opts);
  }
}

export function getAllSnippets(opts: SnippetOptions): Record<SnippetPlatform, string> {
  const platforms: SnippetPlatform[] = [
    'html','react','nextjs','vue','angular',
    'wordpress','shopify','webflow','wix','squarespace','javascript',
  ];
  return Object.fromEntries(
    platforms.map(p => [p, generateSnippet(p, opts)])
  ) as Record<SnippetPlatform, string>;
}
