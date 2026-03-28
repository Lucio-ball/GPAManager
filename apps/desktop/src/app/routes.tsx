import { createBrowserRouter, Outlet } from "react-router-dom";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CourseManagementPage } from "@/pages/course-management-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ImportPage } from "@/pages/import-page";
import { PlanningPage } from "@/pages/planning-page";
import { ScoreManagementPage } from "@/pages/score-management-page";

function AppShell() {
  return (
    <div className="app-shell grid min-h-screen lg:grid-cols-[288px_minmax(0,1fr)]">
      <AppSidebar />
      <div className="relative flex min-h-screen flex-col">
        <AppHeader />
        <main className="flex-1 px-4 pb-8 pt-4 sm:px-6 lg:px-10 lg:pb-10">
          <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "courses", element: <CourseManagementPage /> },
      { path: "scores", element: <ScoreManagementPage /> },
      { path: "planning", element: <PlanningPage /> },
      { path: "import", element: <ImportPage /> },
    ],
  },
]);
