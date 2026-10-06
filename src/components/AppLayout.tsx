import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import {
  Home,
  Search,
  Compass,
  SquarePlus,
  Bookmark,
  LogOut,
  Menu,
  MessageCircle,
  Bell,
  Settings,
  Archive,
  Shield,
  Wallet,
  Users,
  MapPin,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { MediaGrid } from "./MediaGrid";
import { Avatar } from "./Avatar";
import { CreatePostModal } from "./CreatePostModal";
import { Modal } from "./Modal";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const { data: profile } = trpc.social.myProfile.useQuery(undefined, {
    enabled: !!user,
  });
  const results = trpc.social.searchUsers.useQuery(
    { q: search },
    { enabled: search.length > 0 && !search.startsWith("#") }
  );
  const hashtag = trpc.community.search.useQuery(
    { q: search },
    { enabled: search.startsWith("#") && search.length > 1 }
  );
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().slice(0, 50)), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const open = () => setCreateOpen(true);
    window.addEventListener("t:create-post", open);
    return () => window.removeEventListener("t:create-post", open);
  }, []);
  const preferences = trpc.community.preferences.useQuery(undefined, {
    enabled: !!user,
  });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle(
        "dark",
        preferences.data?.theme === "dark" ||
          (preferences.data?.theme === "system" && media.matches)
      );
      document.documentElement.lang = preferences.data?.language || "en";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.data?.theme, preferences.data?.language]);
  const labels: Record<string, Record<string, string>> = {
    fr: {
      Home: "Accueil",
      Explore: "Découvrir",
      Messages: "Messages",
      Activity: "Activité",
      Saved: "Enregistrés",
    },
    yo: {
      Home: "Ilé",
      Explore: "Ṣàwárí",
      Messages: "Ìfiránṣẹ́",
      Activity: "Ìṣe",
      Saved: "Fifipamọ́",
    },
  };
  const navigation = [
    { to: "/", label: "Home", Icon: Home },
    { to: "/explore", label: "Explore", Icon: Compass },
    { to: "/messages", label: "Messages", Icon: MessageCircle },
    { to: "/notifications", label: "Activity", Icon: Bell },
    { to: "/saved", label: "Saved", Icon: Bookmark },
  ];
  const more = [
    { to: "/wallet", label: "Wallet & rewards", Icon: Wallet },
    { to: "/social", label: "Friends, Notes & Instants", Icon: Users },
    { to: "/groups", label: "Groups & channels", Icon: MessageCircle },
    { to: "/map", label: "Post map", Icon: MapPin },
    { to: "/studio", label: "Creator studio", Icon: BarChart3 },
    { to: "/settings", label: "Settings & security", Icon: Settings },
    { to: "/library", label: "Archive & highlights", Icon: Archive },
    { to: "/saved", label: "Saved posts", Icon: Bookmark },
    ...(user?.role === "admin"
      ? [{ to: "/admin", label: "Moderation", Icon: Shield }]
      : []),
  ];
  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[76px] xl:w-[224px] flex-col border-r bg-white p-3 z-30">
        <Link
          to="/"
          aria-label="t home"
          className="px-3 py-5 text-3xl font-black"
        >
          t<span className="text-rose-500">.</span>
        </Link>
        <nav aria-label="Main navigation" className="flex-1 space-y-1">
          {navigation.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl p-3 text-sm hover:bg-neutral-50",
                  isActive && "font-semibold bg-neutral-100"
                )
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="hidden xl:block">
                {labels[preferences.data?.language || "en"]?.[label] || label}
              </span>
            </NavLink>
          ))}
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="nav-action"
          >
            <Search className="w-5 h-5" />
            <span className="hidden xl:block">Search</span>
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            aria-label="Create post"
            className="nav-action"
          >
            <SquarePlus className="w-5 h-5" />
            <span className="hidden xl:block">Create</span>
          </button>
          <NavLink
            aria-label="Profile"
            to={profile ? `/${profile.username}` : "/"}
            className="nav-action"
          >
            <Avatar
              src={profile?.avatarUrl}
              name={profile?.username || "me"}
              size={24}
            />
            <span className="hidden xl:block">Profile</span>
          </NavLink>
        </nav>
        <button
          aria-label="More options"
          className="nav-action"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="w-5 h-5" />
          <span className="hidden xl:block">More</span>
        </button>
      </aside>
      <header className="md:hidden sticky top-0 h-14 border-b bg-white/95 z-30 flex items-center justify-between px-4">
        <Link to="/" aria-label="t home" className="text-2xl font-black">
          t<span className="text-rose-500">.</span>
        </Link>
        <div className="flex items-center">
          <button
            className="icon-button"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-5 h-5" />
          </button>
          <Link
            className="icon-button"
            aria-label="Activity"
            to="/notifications"
          >
            <Bell className="w-5 h-5" />
          </Link>
          <button
            className="icon-button"
            aria-label="More options"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-white flex justify-around pb-[env(safe-area-inset-bottom)]"
      >
        <NavLink to="/" end aria-label="Home" className="icon-button">
          <Home className="w-5 h-5" />
        </NavLink>
        <NavLink to="/explore" aria-label="Explore" className="icon-button">
          <Compass className="w-5 h-5" />
        </NavLink>
        <button
          aria-label="Create post"
          className="icon-button"
          onClick={() => setCreateOpen(true)}
        >
          <SquarePlus className="w-5 h-5" />
        </button>
        <NavLink to="/messages" aria-label="Messages" className="icon-button">
          <MessageCircle className="w-5 h-5" />
        </NavLink>
        <NavLink
          to={profile ? `/${profile.username}` : "/"}
          aria-label="Profile"
          className="icon-button"
        >
          <Avatar
            src={profile?.avatarUrl}
            name={profile?.username || "me"}
            size={24}
          />
        </NavLink>
      </nav>
      <main className="min-w-0 md:pl-[76px] xl:pl-[224px] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
        <footer className="hidden md:block text-center text-xs text-neutral-400 py-8">
          Powered by Timzee Corp
        </footer>
      </main>
      <Modal
        open={searchOpen}
        title="Search people & hashtags"
        onClose={() => setSearchOpen(false)}
      >
        <Input
          autoFocus
          aria-label="Search people"
          maxLength={50}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Username or #hashtag"
        />
        {search.startsWith("#") && (
          <div className="mt-4">
            {hashtag.isFetching ? (
              <p role="status" className="text-sm">
                Searching posts…
              </p>
            ) : hashtag.error ? (
              <p role="alert">Hashtag search unavailable.</p>
            ) : hashtag.data?.length ? (
              <MediaGrid posts={hashtag.data} />
            ) : (
              <p className="text-sm text-neutral-500">No matching posts.</p>
            )}
          </div>
        )}
        {results.isFetching && (
          <p role="status" className="text-sm text-neutral-500">
            Searching…
          </p>
        )}
        {results.error && (
          <p role="alert" className="text-sm text-red-600">
            Search failed. Try again.
          </p>
        )}
        {search &&
          !search.startsWith("#") &&
          !results.isFetching &&
          !results.error &&
          !results.data?.length && (
            <p className="text-sm text-neutral-500">No people found.</p>
          )}
        <div className="space-y-1">
          {results.data?.map(person => (
            <button
              key={person.userId}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 text-left"
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
                navigate(`/${person.username}`);
              }}
            >
              <Avatar src={person.avatarUrl} name={person.username} size={40} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {person.username}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {person.displayName}
                </p>
              </div>
            </button>
          ))}
        </div>
      </Modal>
      <Modal
        open={menuOpen}
        title="Your account"
        onClose={() => setMenuOpen(false)}
      >
        <div>
          {more.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className="nav-action"
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
          <button
            className="nav-action text-red-600"
            onClick={() => {
              setMenuOpen(false);
              logout();
            }}
          >
            <LogOut className="h-5 w-5" />
            Log out
          </button>
        </div>
      </Modal>
      <CreatePostModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
