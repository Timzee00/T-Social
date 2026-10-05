import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Profile from "./pages/Profile";
import Saved from "./pages/Saved";
import Login from "./pages/Login";
import Post from "./pages/Post";
import Settings from "./pages/Settings";
import Messages from "./pages/Messages";
import Notifications from "./pages/Notifications";
import Library from "./pages/Library";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import { RequireSession } from "./components/RequireSession";
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {[
        { path: "/", page: <Home /> },
        { path: "/explore", page: <Explore /> },
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
  );
}
