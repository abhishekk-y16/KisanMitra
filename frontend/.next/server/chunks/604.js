exports.id=604,exports.ids=[604],exports.modules={6023:(e,r,t)=>{"use strict";t.d(r,{bZ:()=>b,Ct:()=>m,zx:()=>i,Zb:()=>d,II:()=>x,Od:()=>u});var a=t(997),s=t(6689);let n=(0,s.forwardRef)(({variant:e="primary",size:r="md",loading:t=!1,icon:s,iconPosition:n="left",fullWidth:i=!1,children:o,className:d="",disabled:c,...x},m)=>{let h=`
      inline-flex items-center justify-center gap-2 
      font-semibold rounded-xl
      transition-all duration-200 ease-out
      focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
      active:scale-[0.98]
    `,u={primary:`
        text-white
        bg-gradient-to-br from-primary-600 to-primary-700
        hover:from-primary-500 hover:to-primary-600 hover:shadow-lg hover:-translate-y-0.5
        focus-visible:ring-primary-500
        shadow-md
      `,secondary:`
        text-neutral-800 bg-white border border-neutral-200
        hover:bg-neutral-50 hover:border-neutral-300 hover:shadow-md hover:-translate-y-0.5
        focus-visible:ring-neutral-400
        shadow-sm
      `,ghost:`
        text-neutral-600 bg-transparent
        hover:bg-neutral-100 hover:text-neutral-800
        focus-visible:ring-neutral-400
      `,danger:`
        text-white
        bg-gradient-to-br from-red-500 to-red-600
        hover:from-red-400 hover:to-red-500 hover:shadow-lg hover:-translate-y-0.5
        focus-visible:ring-red-500
        shadow-md
      `,success:`
        text-white
        bg-gradient-to-br from-emerald-500 to-emerald-600
        hover:from-emerald-400 hover:to-emerald-500 hover:shadow-lg hover:-translate-y-0.5
        focus-visible:ring-emerald-500
        shadow-md
      `};return a.jsx("button",{ref:m,className:`
          ${h}
          ${u[e]}
          ${{sm:"px-4 py-2 text-sm",md:"px-6 py-3 text-base",lg:"px-8 py-4 text-lg"}[r]}
          ${i?"w-full":""}
          ${d}
        `,disabled:c||t,...x,children:t?(0,a.jsxs)(a.Fragment,{children:[a.jsx(l,{size:r}),a.jsx("span",{children:"Please wait..."})]}):(0,a.jsxs)(a.Fragment,{children:[s&&"left"===n&&a.jsx("span",{className:"flex-shrink-0",children:s}),o,s&&"right"===n&&a.jsx("span",{className:"flex-shrink-0",children:s})]})})});n.displayName="Button";let i=n;function l({size:e}){return(0,a.jsxs)("svg",{className:`animate-spin ${{sm:"w-4 h-4",md:"w-5 h-5",lg:"w-6 h-6"}[e]}`,fill:"none",viewBox:"0 0 24 24",children:[a.jsx("circle",{className:"opacity-25",cx:"12",cy:"12",r:"10",stroke:"currentColor",strokeWidth:"4"}),a.jsx("path",{className:"opacity-75",fill:"currentColor",d:"M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"})]})}let o=(0,s.forwardRef)(({variant:e="default",hover:r=!1,selected:t=!1,padding:s="md",children:n,className:i="",...l},o)=>{let d=`
      rounded-2xl
      transition-all duration-300 ease-out
    `,c={default:`
        bg-white border border-neutral-100
        shadow-[0_4px_8px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)]
      `,elevated:`
        bg-white border border-neutral-100
        shadow-[0_8px_24px_rgba(0,0,0,0.12),0_4px_8px_rgba(0,0,0,0.06)]
      `,outlined:`
        bg-white border-2 border-neutral-200
      `,glass:`
        bg-white/80 backdrop-blur-xl border border-white/50
        shadow-[0_4px_8px_rgba(0,0,0,0.08)]
      `};return a.jsx("div",{ref:o,className:`
          ${d}
          ${c[e]}
          ${{none:"",sm:"p-4",md:"p-6",lg:"p-8"}[s]}
          ${r?"cursor-pointer hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.14)] hover:border-primary-200":""}
          ${t?"border-primary-500 shadow-[0_4px_8px_rgba(0,0,0,0.08),0_0_0_3px_rgba(76,175,80,0.15)]":""}
          ${i}
        `,...l,children:n})});o.displayName="Card";let d=o,c=(0,s.forwardRef)(({label:e,className:r="",...t},s)=>(0,a.jsxs)("div",{className:`flex flex-col ${r}`,children:[e&&a.jsx("label",{className:"text-sm text-neutral-700 mb-1",children:e}),a.jsx("input",{ref:s,className:"border rounded-md px-3 py-2 text-sm bg-white",...t})]}));c.displayName="Input";let x=c;function m({variant:e="primary",size:r="md",icon:t,dot:s=!1,className:n="",children:i}){return(0,a.jsxs)("span",{className:`
        inline-flex items-center gap-1.5 
        font-semibold rounded-full border
        ${{primary:"bg-primary-100 text-primary-800 border-primary-200",secondary:"bg-secondary-100 text-secondary-800 border-secondary-200",success:"bg-emerald-100 text-emerald-800 border-emerald-200",warning:"bg-amber-100 text-amber-800 border-amber-200",error:"bg-red-100 text-red-800 border-red-200",info:"bg-blue-100 text-blue-800 border-blue-200",neutral:"bg-neutral-100 text-neutral-700 border-neutral-200"}[e]}
        ${{sm:"px-2 py-0.5 text-xs",md:"px-2.5 py-1 text-xs"}[r]}
        ${n}
      `,children:[s&&a.jsx("span",{className:`w-1.5 h-1.5 rounded-full ${{primary:"bg-primary-500",secondary:"bg-secondary-500",success:"bg-emerald-500",warning:"bg-amber-500",error:"bg-red-500",info:"bg-blue-500",neutral:"bg-neutral-500"}[e]}`}),t&&a.jsx("span",{className:"flex-shrink-0",children:t}),i]})}function h({variant:e="text",width:r,height:t,className:s=""}){let n=`
    bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200
    bg-[length:200%_100%]
    animate-shimmer
  `,i={};return r&&(i.width=r),t&&(i.height=t),a.jsx("div",{className:`${n} ${{text:"h-4 rounded-md w-full",title:"h-7 rounded-md w-3/4",avatar:"w-12 h-12 rounded-full",card:"h-32 rounded-2xl",button:"h-12 rounded-xl w-32",circle:"rounded-full aspect-square"}[e]} ${s}`,style:i,role:"status","aria-label":"Loading..."})}let u=Object.assign(h,{Text:function({lines:e=3}){return a.jsx("div",{className:"space-y-2",children:Array.from({length:e}).map((r,t)=>a.jsx(h,{variant:"text",width:t===e-1?"60%":"100%"},t))})},Card:function(){return(0,a.jsxs)("div",{className:"bg-white rounded-2xl p-6 border border-neutral-100 shadow-md space-y-4",children:[(0,a.jsxs)("div",{className:"flex items-center gap-4",children:[a.jsx(h,{variant:"avatar"}),(0,a.jsxs)("div",{className:"flex-1 space-y-2",children:[a.jsx(h,{variant:"title"}),a.jsx(h,{variant:"text",width:"60%"})]})]}),(0,a.jsxs)("div",{className:"space-y-2",children:[a.jsx(h,{variant:"text"}),a.jsx(h,{variant:"text"}),a.jsx(h,{variant:"text",width:"80%"})]})]})},FeatureCard:function(){return(0,a.jsxs)("div",{className:"bg-white rounded-2xl p-6 border border-neutral-100 shadow-md flex flex-col items-center justify-center min-h-[140px]",children:[a.jsx(h,{variant:"circle",width:"48px",height:"48px",className:"mb-3"}),a.jsx(h,{variant:"text",width:"80px",className:"mb-1"}),a.jsx(h,{variant:"text",width:"60px",height:"12px"})]})},PriceList:function(){return a.jsx("div",{className:"space-y-3",children:[1,2,3,4].map(e=>(0,a.jsxs)("div",{className:"flex justify-between items-center py-2",children:[a.jsx(h,{variant:"text",width:"120px"}),a.jsx(h,{variant:"text",width:"80px"})]},e))})}}),p={info:a.jsx("svg",{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",children:a.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"})}),success:a.jsx("svg",{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",children:a.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"})}),warning:a.jsx("svg",{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",children:a.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"})}),error:a.jsx("svg",{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",children:a.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"})})};function b({variant:e="info",title:r,icon:t,children:s,onDismiss:n,className:i=""}){return(0,a.jsxs)("div",{className:`
        flex items-start gap-3 p-4 rounded-xl border
        animate-fade-in-up
        ${{info:"bg-blue-50 border-blue-200 text-blue-800",success:"bg-emerald-50 border-emerald-200 text-emerald-800",warning:"bg-amber-50 border-amber-200 text-amber-800",error:"bg-red-50 border-red-200 text-red-800"}[e]}
        ${i}
      `,role:"alert",children:[a.jsx("span",{className:`flex-shrink-0 ${{info:"text-blue-500",success:"text-emerald-500",warning:"text-amber-500",error:"text-red-500"}[e]}`,children:t||p[e]}),(0,a.jsxs)("div",{className:"flex-1 min-w-0",children:[r&&a.jsx("h4",{className:"font-semibold mb-1",children:r}),a.jsx("div",{className:"text-sm",children:s})]}),n&&a.jsx("button",{onClick:n,className:"flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors","aria-label":"Dismiss",children:a.jsx("svg",{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",children:a.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M6 18L18 6M6 6l12 12"})})})]})}},3893:(e,r,t)=>{"use strict";t.r(r),t.d(r,{default:()=>l});var a=t(997);t(108);var s=t(968),n=t.n(s),i=t(6689);function l({Component:e,pageProps:r}){let[t,s]=(0,i.useState)(!1);return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)(n(),{children:[a.jsx("meta",{charSet:"utf-8"}),a.jsx("meta",{name:"viewport",content:"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"}),a.jsx("meta",{name:"theme-color",content:"#2E7D32"}),a.jsx("link",{rel:"manifest",href:"/manifest.json"}),a.jsx("link",{rel:"apple-touch-icon",href:"/icons/icon-192x192.png"}),a.jsx("title",{children:"Kisan-Mitra | किसान मित्र"})]}),t&&a.jsx("div",{className:"offline-banner",children:"\uD83D\uDCF4 ऑफलाइन मोड | Offline Mode – Data will sync when connected"}),a.jsx(e,{...r})]})}},1070:(e,r,t)=>{"use strict";t.r(r),t.d(r,{default:()=>n});var a=t(997),s=t(6859);function n(){return(0,a.jsxs)(s.Html,{lang:"hi",children:[(0,a.jsxs)(s.Head,{children:[a.jsx("link",{rel:"preconnect",href:"https://fonts.googleapis.com"}),a.jsx("link",{rel:"preconnect",href:"https://fonts.gstatic.com",crossOrigin:"anonymous"}),a.jsx("link",{href:"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Noto+Sans:wght@400;500;600;700&display=swap",rel:"stylesheet"}),a.jsx("meta",{name:"description",content:"Kisan-Mitra: Your intelligent farming companion for crop diagnosis, market prices, and weather alerts"}),a.jsx("meta",{name:"application-name",content:"Kisan-Mitra"}),a.jsx("meta",{name:"apple-mobile-web-app-capable",content:"yes"}),a.jsx("meta",{name:"apple-mobile-web-app-status-bar-style",content:"default"}),a.jsx("meta",{name:"apple-mobile-web-app-title",content:"Kisan-Mitra"}),a.jsx("meta",{name:"format-detection",content:"telephone=no"}),a.jsx("meta",{name:"mobile-web-app-capable",content:"yes"})]}),(0,a.jsxs)("body",{className:"antialiased",children:[a.jsx(s.Main,{}),a.jsx(s.NextScript,{})]})]})}},108:()=>{}};