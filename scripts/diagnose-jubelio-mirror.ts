async function main() {
  const { getAllOverviewOrders, insertOverviewOrders } = await import("@/lib/db");
  const { unmatchedMarketplaceOrders, buildDueDateOverview } = await import("@/lib/due-date");
  const { orderNumberKeys } = await import("@/lib/order-match");
  const { fetchJubelioOrderByKey } = await import("@/lib/jubelio-api");

  const persist = process.argv.includes("--persist");
  const orders = await getAllOverviewOrders();
  const overview = buildDueDateOverview(orders);
  const unmatched = unmatchedMarketplaceOrders(orders);
  const jubelio = orders.filter((order) => order.platform === "jubelio");
  const jubelioKeys = new Set(jubelio.flatMap((order) => orderNumberKeys(order)));
  const sample = unmatched.slice(0, persist ? 12 : 6);

  const lookups: Record<string, unknown>[] = [];
  const foundOrders = [];
  for (const order of sample) {
    const inLocal = orderNumberKeys(order).some((key) => jubelioKeys.has(key));
    try {
      const found = await fetchJubelioOrderByKey(order.orderNumber);
      if (found) foundOrders.push(found);
      lookups.push({
        orderNumber: order.orderNumber,
        platform: order.platform,
        inLocalJubelioKeys: inLocal,
        jubelioApi: found ? "found" : "missing",
        jubelioNo: found?.orderNumber,
        jubelioRef: found?.refNo,
      });
    } catch (error) {
      lookups.push({
        orderNumber: order.orderNumber,
        platform: order.platform,
        inLocalJubelioKeys: inLocal,
        jubelioApi: "error",
        error: error instanceof Error ? error.message : "lookup failed",
      });
    }
  }

  if (persist && foundOrders.length > 0) {
    await insertOverviewOrders(
      foundOrders.map((order) => ({
        ...order,
        orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : undefined,
        paidTime: order.paidTime ? new Date(order.paidTime).toISOString() : undefined,
        shippedTime: order.shippedTime ? new Date(order.shippedTime).toISOString() : undefined,
        mustShipBefore: order.mustShipBefore
          ? new Date(order.mustShipBefore).toISOString()
          : undefined,
        pickupTime: order.pickupTime ? new Date(order.pickupTime).toISOString() : undefined,
      }))
    );
  }

  const after = persist ? buildDueDateOverview(await getAllOverviewOrders()) : overview;

  console.log(
    JSON.stringify(
      {
        totals: {
          marketplaceToday: overview.totalOrders,
          mirroredBefore: overview.jubelio,
          missingBefore: overview.missingJubelioRows.length,
          jubelioRows: jubelio.length,
          mirroredAfter: after.jubelio,
          missingAfter: after.missingJubelioRows.length,
        },
        sampleLookups: lookups,
        persisted: persist ? foundOrders.length : 0,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
