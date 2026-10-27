// Public address of the store, for absolute links in shared previews, robots
// and the sitemap. Production sets it when the image is built (see Dockerfile).
export const siteUrl = (process.env.XPANDER_PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");
