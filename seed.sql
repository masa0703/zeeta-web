-- サンプルデータの挿入
INSERT OR IGNORE INTO nodes (id, parent_id, title, content, author, position) VALUES 
  (1, NULL, 'プロジェクト計画', 'プロジェクト全体の計画を記載', 'Admin', 0),
  (2, 1, '目標', '今月中にプロトタイプを完成させる', 'Admin', 0),
  (3, 1, 'タスクリスト', '実施すべきタスクの一覧', 'Admin', 1),
  (4, 3, 'デザイン', 'UI/UXデザインを作成', 'Designer', 0),
  (5, 3, '実装', 'コーディング作業', 'Developer', 1),
  (6, NULL, 'アイデアメモ', '思いついたアイデアを記録', 'Admin', 1),
  (7, 6, '機能追加案', '検索機能を追加したい', 'Admin', 0);
