import type { MetadataRoute } from "next";

/** Lets "Add to Home Screen" open Gigs full-screen with its own icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gigs",
    short_name: "Gigs",
    description: "Stats about gig bookings from Apple Calendar.",
    start_url: "/",
    display: "standalone",
    background_color: "#101216",
    theme_color: "#101216",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // The bars sit inside the safe zone, so Android can crop the same image to a circle.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
