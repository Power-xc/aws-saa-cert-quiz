/**
 * Korean question text spells out core AWS concepts with the wording of the
 * official Korean AWS documentation, but the exam may present them in English.
 * `annotateTerms` appends the English term in parentheses the first time each
 * concept appears in a string, unless it is already followed by an opening
 * bracket. Service names (S3, EC2, RDS …) are written in English in the source
 * data, so they need no annotation.
 */
const TERM_GLOSSARY: readonly (readonly [ko: string, en: string])[] = [
  ['최소 권한 원칙', 'least privilege'],
  ['전송 중 데이터 암호화', 'encryption in transit'],
  ['저장 데이터 암호화', 'encryption at rest'],
  ['읽기 전용 복제본', 'read replica'],
  ['교차 리전 복제', 'cross-Region replication'],
  ['교차 계정', 'cross-account'],
  ['가용 영역', 'Availability Zone'],
  ['탄력적 IP 주소', 'Elastic IP address'],
  ['예약 인스턴스', 'Reserved Instance'],
  ['온디맨드 인스턴스', 'On-Demand Instance'],
  ['온디맨드 용량 예약', 'On-Demand Capacity Reservation'],
  ['다중 AZ', 'Multi-AZ'],
  ['보안 그룹', 'security group'],
  ['자동 확장', 'Auto Scaling'],
  ['수평 확장', 'horizontal scaling'],
  ['수직 확장', 'vertical scaling'],
  ['장애 조치', 'failover'],
  ['고가용성', 'high availability'],
  ['내결함성', 'fault tolerance'],
  ['재해 복구', 'disaster recovery'],
  ['수명 주기 정책', 'lifecycle policy'],
  ['수명 주기 후크', 'lifecycle hook'],
  ['느슨한 결합', 'loose coupling'],
];

export function annotateTerms(value: string): string {
  if (!value) return '';
  return TERM_GLOSSARY.reduce((text, [ko, en]) => {
    const start = text.indexOf(ko);
    if (start < 0) return text;
    const end = start + ko.length;
    if (/^\s*[(（]/.test(text.slice(end))) return text;
    return `${text.slice(0, end)} (${en})${text.slice(end)}`;
  }, value);
}
