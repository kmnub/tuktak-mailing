import "./globals.css";

export const metadata = {
  title: "박람회 기업명 추출",
  description: "박람회 참가기업명을 수집하는 웹앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50">{children}</body>
    </html>
  );
}
