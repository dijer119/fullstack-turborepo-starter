import { KrxSchedulerService } from './krx-scheduler.service';

describe('KrxSchedulerService', () => {
  const createService = () => {
    const prisma = {
      stock: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const service = new KrxSchedulerService(prisma as any);
    jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    return { service, prisma };
  };

  it('does not persist ten-year calculated values when EPS/BPS ratio is unrealistic', async () => {
    const { service, prisma } = createService();
    prisma.stock.findMany.mockResolvedValue([
      {
        id: 1,
        code: '066900',
        name: '디에이피',
        close: { toString: () => '10000' },
      },
    ]);
    jest.spyOn(service as any, 'fetchFinancialDataFromNaver').mockResolvedValue({
      eps: 2000,
      bps: 1,
      dividendYield: null,
    });
    prisma.stock.update.mockResolvedValue({});

    const result = await service.updateEpsAndBps();

    expect(result).toEqual({ success: 1, fail: 0, failedStocks: [] });
    expect(prisma.stock.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        eps: 2000,
        bps: 1,
        tenYearValue: null,
        tenYearMultiple: null,
        stockValue: null,
      }),
    });
  });

  it('converts decimal overflow values to null before updating the stock', async () => {
    const { service, prisma } = createService();
    prisma.stock.findMany.mockResolvedValue([
      {
        id: 1,
        code: '000001',
        name: '테스트',
        close: { toString: () => '100000' },
      },
    ]);
    jest.spyOn(service as any, 'fetchFinancialDataFromNaver').mockResolvedValue({
      eps: 0.0001,
      bps: null,
      dividendYield: null,
    });
    prisma.stock.update.mockResolvedValue({});

    await service.updateEpsAndBps();

    expect(prisma.stock.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        eps: 0.0001,
        per: null,
      }),
    });
  });
});
