import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("health")
  health() {
    return { ok: true, service: "fti-api", ...this.dashboard.cacheInfo() };
  }

  @Get("dashboard")
  dashboardSnapshot(@Query("fresh") fresh?: string) {
    return this.dashboard.loadDashboard(fresh === "1");
  }
}
