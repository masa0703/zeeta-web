-- サンプルデータの挿入
INSERT OR IGNORE INTO nodes (id, title, content, author, root_position) VALUES
  (1, 'プロジェクト計画', 'プロジェクト全体の計画を記載', 'Admin', 0),
  (2, '目標', '今月中にプロトタイプを完成させる', 'Admin', 1),
  (3, 'タスクリスト', '実施すべきタスクの一覧', 'Admin', 2),
  (4, 'デザイン', 'UI/UXデザインを作成', 'Designer', 3),
  (5, '実装', 'コーディング作業', 'Developer', 4),
  (6, 'アイデアメモ', '思いついたアイデアを記録', 'Admin', 5),
  (7, '機能追加案', '検索機能を追加したい', 'Admin', 6);

-- 親子関係の設定
INSERT OR IGNORE INTO node_relations (parent_node_id, child_node_id, position) VALUES
  (1, 2, 0),
  (1, 3, 1),
  (3, 4, 0),
  (3, 5, 1),
  (6, 7, 0);
