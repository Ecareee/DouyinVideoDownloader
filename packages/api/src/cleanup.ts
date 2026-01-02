import { prisma } from './db';
import { queue, redis } from './redis';

export async function cleanupOrphanedRedisKeys() {
  try {
    const targets = await prisma.target.findMany({ select: { id: true } });
    const targetIds = new Set(targets.map((t: { id: any; }) => t.id));

    const schedulers = await queue.getJobSchedulers();
    const validSchedulerKeys = new Set<string>();
    let deletedSchedulers = 0;

    for (const scheduler of schedulers) {
      const dataTargetId = (scheduler as any).template?.data?.targetId;
      if (dataTargetId && !targetIds.has(dataTargetId)) {
        try {
          await queue.removeJobScheduler(scheduler.key);
          deletedSchedulers++;
        } catch {
        }
      } else {
        validSchedulerKeys.add(scheduler.key);
      }
    }

    const repeatKeys = await redis.keys('bull:monitor:repeat:*');
    let deletedRepeatKeys = 0;

    for (const key of repeatKeys) {
      const targetMatch = key.match(/bull:monitor:repeat:target:([a-z0-9]+):/i);
      if (targetMatch) {
        const foundTargetId = targetMatch[1];
        if (!targetIds.has(foundTargetId)) {
          try {
            await redis.del(key);
            deletedRepeatKeys++;
          } catch {
          }
        }
      }
    }

    const manualKeys = await redis.keys('bull:monitor:manual:*');
    let deletedManualKeys = 0;

    for (const key of manualKeys) {
      const match = key.match(/bull:monitor:manual:([a-z0-9]+):/i);
      if (match) {
        const keyTargetId = match[1];
        if (!targetIds.has(keyTargetId)) {
          try {
            await redis.del(key);
            deletedManualKeys++;
          } catch {
          }
        }
      }
    }

    if (deletedSchedulers > 0 || deletedRepeatKeys > 0 || deletedManualKeys > 0) {
      console.log(`[cleanup] 清理完成：${deletedSchedulers} scheduler, ${deletedRepeatKeys} repeat, ${deletedManualKeys} manual`);
    }
  } catch (e) {
    console.error('[cleanup] 清理失败：', e);
  }
}