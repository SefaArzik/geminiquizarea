import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import TeacherCreate from "./pages/TeacherCreate.tsx";
import Lobby from "./pages/Lobby.tsx";
import TeacherDashboard from "./pages/TeacherDashboard.tsx";
import TeacherSolve from "./pages/TeacherSolve.tsx";
import StudentJoin from "./pages/StudentJoin.tsx";
import StudentArena from "./pages/StudentArena.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/teacher/create" element={<TeacherCreate />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
          <Route path="/teacher/solve" element={<TeacherSolve />} />
          <Route path="/join" element={<StudentJoin />} />
          <Route path="/student" element={<StudentArena />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
