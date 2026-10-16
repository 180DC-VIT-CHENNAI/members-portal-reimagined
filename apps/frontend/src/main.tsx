import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import ErrorBoundary from "./components/ErrorBoundary";

const RecruitmentsPage = lazy(() => import("./pages/RecruitmentsPage.tsx"));
const GalleryPage = lazy(() => import("./pages/GalleryPage.tsx"));
const RequestAccount = lazy(() => import("./pages/RequestAccount.tsx"));
const MembersLayout = lazy(() => import("./pages/members/MembersLayout.tsx"));
const SubscriberPage = lazy(() => import("./pages/SubscriberPage.tsx"));
const NewsletterEditorPage = lazy(() => import("./pages/NewsletterEditorPage.tsx"));
const LetterStudioPage = lazy(() => import("./pages/letters/LetterStudioPage.tsx"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage.tsx"));

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  console.warn("[Vite] Chunk preload failed, reloading...", event.payload);
  window.location.reload();
});

const PageLoader = (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg-primary)" }}>
    <div className="card-doodle" style={{ padding: 24, textAlign: "center" }}>
      <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>Loading...</p>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Please wait.</p>
    </div>
  </div>
);

const PageError = (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg-primary)" }}>
    <div className="card-doodle" style={{ padding: 24, textAlign: "center", maxWidth: 420 }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: "var(--status-error)", margin: "0 0 8px" }}>Something went wrong</p>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Failed to load. Please refresh the page.</p>
    </div>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route
            path="/gallery"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <GalleryPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/recruitments"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <RecruitmentsPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/request-account"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <RequestAccount />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/subscriber"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <SubscriberPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/subscriber/newsletter"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <NewsletterEditorPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/letters"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <LetterStudioPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/unsubscribe"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <UnsubscribePage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/unsubscribe/:token"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <UnsubscribePage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/members"
            element={
              <ErrorBoundary fallback={PageError}>
                <Suspense fallback={PageLoader}>
                  <MembersLayout />
                </Suspense>
              </ErrorBoundary>
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
