import { Header } from "@/components/admin/Header";
import { DaemonMetrics } from "@/components/admin/DaemonMetrics";
import { HeroIntro } from "@/components/admin/HeroIntro";
import { ServerLogs } from "@/components/admin/ServerLogs";
import { SessionsList } from "@/components/admin/SessionsList";

const Index = () => {
  return (
    <main className="min-h-screen bg-background pt-20">
      <Header />
      <div className="container mx-auto px-4 pt-4">
        <HeroIntro />
      </div>
      <DaemonMetrics />
      <SessionsList />
      <ServerLogs />
    </main>
  );
};

export default Index;
