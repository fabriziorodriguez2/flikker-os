CREATE INDEX "Campaign_businessId_template_kind_status_idx" ON "Campaign"("businessId", "template_kind", "status");
CREATE INDEX "Customer_businessId_birthday_idx" ON "Customer"("businessId", "birthday");
CREATE INDEX "ServiceEvent_businessId_eventAt_idx" ON "ServiceEvent"("businessId", "eventAt");
