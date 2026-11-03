import { Navigate, Route, Routes } from "react-router-dom";
import { SiteChrome } from "@/components/SiteChrome";
import { FeedExplorer } from "@/components/FeedExplorer";
import { SavedExplorer } from "@/components/SavedExplorer";
import { HealthView } from "@/components/HealthView";
import { SettingsView } from "@/components/SettingsView";
import { MoreMenu } from "@/components/MoreMenu";
import { PageTransition } from "./PageTransition";
import CompliancePage from "@/app/compliance/page";

export default function App() {
  return (
    <SiteChrome>
      <PageTransition>
        <Routes>
          <Route path="/" element={<FeedExplorer />} />
          <Route path="/queue" element={<SavedExplorer kind="queue" />} />
          <Route path="/favorites" element={<SavedExplorer kind="favorites" />} />
          <Route path="/more" element={<MoreMenu />} />
          <Route path="/health" element={<HealthView />} />
          <Route path="/settings" element={<SettingsView mobile />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageTransition>
    </SiteChrome>
  );
}
