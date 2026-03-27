import "./globals.css";

export const metadata = {
  title: "NewsNavigator AI",
  description: "Personalized AI-native news intelligence platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
