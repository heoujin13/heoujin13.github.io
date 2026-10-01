/**
 * 칼로리 계산
 *
 * 러닝의 에너지 소모는 속도와 거의 무관하게 '체중 × 거리'에 비례한다는
 * 널리 쓰이는 근사식을 사용합니다.
 *   kcal ≈ 체중(kg) × 거리(km) × 1.036
 */
export const KCAL_PER_KG_PER_KM = 1.036;

export function calculateCalories(distanceM, weightKg) {
  const w = Number.isFinite(weightKg) && weightKg >= 20 && weightKg <= 300 ? weightKg : 65;
  const km = Number.isFinite(distanceM) && distanceM > 0 ? distanceM / 1000 : 0;
  return w * km * KCAL_PER_KG_PER_KM;
}
