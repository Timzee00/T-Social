import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router";
const Wallet = lazy(() => import("./pages/Wallet"));
const WalletAdmin = lazy(() => import("./pages/WalletAdmin"));
const Groups = lazy(() => import("./pages/Groups"));
const Social = lazy(() => import("./pages/Social"));
const Map = lazy(() => import("./pages/Map"));
const Studio = lazy(() => import("./pages/Studio"));
const Home = lazy(() => import("./pages/Home"));
const Explore = lazy(() => import("./pages/Explore"));
const Profile = lazy(() => import("./pages/Profile"));
const Saved = lazy(() => import("./pages/Saved"));
const Login = lazy(() => import("./pages/Login"));
const Post = lazy(() => import("./pages/Post"));
const Settings = lazy(() => import("./pages/Settings"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Library = lazy(() => import("./pages/Library"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));
import { RequireSession } from "./components/RequireSession";
export default function App() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8 text-sm">
          Loading…
        </p>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        {[
          { path: "/", page: <Home /> },
          { path: "/explore", page: <Explore /> },
          { path: "/wallet", page: <Wallet /> },
          { path: "/wallet/admin", page: <WalletAdmin /> },
          { path: "/groups", page: <Groups /> },
          { path: "/social", page: <Social /> },
          { path: "/map", page: <Map /> },
          { path: "/studio", page: <Studio /> },
          { path: "/saved", page: <Saved /> },
          { path: "/settings", page: <Settings /> },
          { path: "/messages", page: <Messages /> },
          { path: "/notifications", page: <Notifications /> },
          { path: "/library", page: <Library /> },
          { path: "/admin", page: <Admin /> },
          { path: "/post/:postId", page: <Post /> },
          { path: "/:username", page: <Profile /> },
        ].map(route => (
          <Route
            key={route.path}
            path={route.path}
            element={<RequireSession>{route.page}</RequireSession>}
          />
        ))}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
