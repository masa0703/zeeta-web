PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" VALUES(1,'0001_initial_schema.sql','2025-12-07 12:20:30');
INSERT INTO "d1_migrations" VALUES(2,'0002_add_node_relations.sql','2025-12-07 12:20:30');
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  title TEXT NOT NULL,
  content TEXT,
  author TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
);
INSERT INTO "nodes" VALUES(3,NULL,'ploom','','Admin','2025-12-07 12:24:33','2025-12-07 12:24:47',3);
INSERT INTO "nodes" VALUES(4,NULL,'電子タバコ','','Admin','2025-12-07 12:24:44','2025-12-08 02:42:06',0);
INSERT INTO "nodes" VALUES(5,NULL,'コンビニ',replace('# ここでは、コンビニを管理するのだ\n\n## そーなのだ\n\n### でもないのだ\n* およよよよ\n* aaaaa\n  * bbbbb\n    * ccc\n\n![けろけろ](https://baseec-img-mng.akamaized.net/images/item/origin/414d66bcf043fb18273ea548e5c53bd6.jpg?imformat=generic)','\n',char(10)),'Admin','2025-12-07 12:25:04','2025-12-09 00:23:34',0);
INSERT INTO "nodes" VALUES(6,5,'セブン','','Admin','2025-12-07 12:25:10','2025-12-07 12:25:10',0);
INSERT INTO "nodes" VALUES(7,5,'ローソン','','Admin','2025-12-07 12:25:16','2025-12-07 12:25:16',0);
INSERT INTO "nodes" VALUES(8,5,'ファミマ','','Admin','2025-12-07 12:25:32','2025-12-07 12:25:32',0);
INSERT INTO "nodes" VALUES(9,NULL,'ミニストップ','','Admin','2025-12-07 12:28:04','2025-12-07 12:28:04',0);
INSERT INTO "nodes" VALUES(10,NULL,'駅','','Admin','2025-12-07 12:47:33','2025-12-07 12:47:33',0);
INSERT INTO "nodes" VALUES(11,NULL,'江古田','','Admin','2025-12-07 12:47:54','2025-12-07 12:47:54',0);
INSERT INTO "nodes" VALUES(12,NULL,'アイコス','','Admin','2025-12-07 13:19:05','2025-12-07 13:19:05',0);
INSERT INTO "nodes" VALUES(13,NULL,'グロー','','Admin','2025-12-07 13:19:54','2025-12-07 13:19:54',0);
INSERT INTO "nodes" VALUES(14,NULL,'AI','','Admin','2025-12-08 02:21:39','2025-12-08 02:21:39',0);
INSERT INTO "nodes" VALUES(15,NULL,'ChatGPT','','Admin','2025-12-08 02:21:46','2025-12-08 02:21:46',0);
INSERT INTO "nodes" VALUES(16,NULL,'Gemini','','Admin','2025-12-08 02:21:55','2025-12-08 02:21:55',0);
INSERT INTO "nodes" VALUES(17,NULL,'Claude','','Admin','2025-12-08 02:22:08','2025-12-08 02:22:08',0);
INSERT INTO "nodes" VALUES(18,NULL,'Genspark','','Admin','2025-12-08 02:22:18','2025-12-08 02:22:18',0);
INSERT INTO "nodes" VALUES(19,NULL,'hogehoge','','Admin','2025-12-08 02:25:04','2025-12-08 02:33:00',0);
INSERT INTO "nodes" VALUES(20,NULL,'議事録','','Admin','2025-12-08 02:25:10','2025-12-08 02:25:10',0);
INSERT INTO "nodes" VALUES(21,NULL,'2025-1208 DevJP',replace('### 参加者\nクリス、石山、三上\n\n### 勤怠連絡\n\n### TODO\n\n# 状況\n* 石山\n  * ITA対応\n    * 計算処理、バグ対応\n    * 対応中\n  * 追加のテストケース\n    * VNでやるっぽい\n* クリス\n  * 12/8にupdateがあるので、それ待ち\n\n\n# xxxのAPI疎通\n伝票番号の赤電・黒電\n画面仕様書の修正\nJJ確認待ち\n実装完了\n今日12/4からテスト\n\nパラメータの型違い\nモックでは、パラメータはあまり見ていないため\n影響\n今回は、ITBの手前で確認したため、大きな影響はない\n対策\nモックで型チェックを入れる\n→このPJでやる必要はない\n\n# 雑談コーナー（三上）\nhttps://zeeta2.pages.dev/','\n',char(10)),'Admin','2025-12-08 02:25:37','2025-12-08 02:29:55',0);
INSERT INTO "nodes" VALUES(22,NULL,'2025-1205 Daily',replace('* ITB管理web\n* 管理webは一切できない\n* 実施できないテストケースをNTにする\n\nNoteに「管理Webが来てから実施」と記載する\n\n* 開発定例アジェンダ\n* 20251205_開発定例　12月05日 (金曜日)⋅午後16:00～17:00\n* 橋本さん、篠田さんへ\n* UI持ち込むか？確認させてください！\n* 早川さんへ\n* テスト実施についての方針共有の内容記載をお願いいたします。','\n',char(10)),'Admin','2025-12-08 02:30:31','2025-12-09 00:15:50',0);
INSERT INTO "nodes" VALUES(23,NULL,'＠＠使い方＠＠',replace('## 別の親の子供になる\nTree-view上で\n* 親を増やしたいノードを選択\n* command+c\n* 親にしたいノードを選択\n* commnad+v','\n',char(10)),'Admin','2025-12-08 02:40:58','2025-12-09 00:30:06',1);
INSERT INTO "nodes" VALUES(25,26,'aaaa','','Admin','2025-12-08 07:17:54','2025-12-09 01:13:32',0);
INSERT INTO "nodes" VALUES(26,NULL,'いろいろ実験','','Admin','2025-12-08 07:18:33','2025-12-09 00:32:51',0);
INSERT INTO "nodes" VALUES(27,NULL,'bbb','## test','Chris','2025-12-08 07:26:10','2025-12-08 07:27:31',0);
INSERT INTO "nodes" VALUES(28,NULL,'srg','','Admin','2025-12-08 07:57:54','2025-12-08 07:57:54',0);
INSERT INTO "nodes" VALUES(29,26,'eardgaerg','','Admin','2025-12-08 07:58:02','2025-12-09 01:13:32',1);
INSERT INTO "nodes" VALUES(30,26,'ccc','','Admin','2025-12-08 15:04:42','2025-12-09 01:13:32',2);
INSERT INTO "nodes" VALUES(31,NULL,'eee','','Admin','2025-12-08 15:12:28','2025-12-08 15:12:28',0);
INSERT INTO "nodes" VALUES(32,27,'ddd','','Admin','2025-12-09 00:33:08','2025-12-09 00:33:17',0);
INSERT INTO "nodes" VALUES(33,26,'1.あまがえる','','Admin','2025-12-09 00:33:41','2025-12-09 01:13:32',3);
INSERT INTO "nodes" VALUES(34,26,'4.がまがえる','','Admin','2025-12-09 00:33:54','2025-12-09 01:13:32',6);
INSERT INTO "nodes" VALUES(35,26,'2.殿様がえる','','Admin','2025-12-09 00:34:18','2025-12-09 01:13:32',4);
INSERT INTO "nodes" VALUES(36,26,'3.食用がえる','','Admin','2025-12-09 00:34:32','2025-12-09 01:13:32',5);
CREATE TABLE node_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_node_id INTEGER NOT NULL,
  child_node_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE(parent_node_id, child_node_id)
);
INSERT INTO "node_relations" VALUES(1,4,3,'2025-12-07 12:24:50');
INSERT INTO "node_relations" VALUES(3,5,6,'2025-12-07 12:25:21');
INSERT INTO "node_relations" VALUES(4,5,7,'2025-12-07 12:25:25');
INSERT INTO "node_relations" VALUES(5,5,8,'2025-12-07 12:25:40');
INSERT INTO "node_relations" VALUES(6,5,9,'2025-12-07 12:28:05');
INSERT INTO "node_relations" VALUES(9,10,11,'2025-12-07 12:47:55');
INSERT INTO "node_relations" VALUES(10,11,7,'2025-12-07 12:48:02');
INSERT INTO "node_relations" VALUES(11,11,6,'2025-12-07 12:48:06');
INSERT INTO "node_relations" VALUES(12,11,8,'2025-12-07 12:48:29');
INSERT INTO "node_relations" VALUES(13,4,12,'2025-12-07 13:19:06');
INSERT INTO "node_relations" VALUES(14,4,13,'2025-12-07 13:19:55');
INSERT INTO "node_relations" VALUES(15,14,15,'2025-12-08 02:21:47');
INSERT INTO "node_relations" VALUES(16,14,16,'2025-12-08 02:21:56');
INSERT INTO "node_relations" VALUES(17,14,17,'2025-12-08 02:22:09');
INSERT INTO "node_relations" VALUES(18,14,18,'2025-12-08 02:22:18');
INSERT INTO "node_relations" VALUES(19,19,20,'2025-12-08 02:25:11');
INSERT INTO "node_relations" VALUES(20,20,21,'2025-12-08 02:25:38');
INSERT INTO "node_relations" VALUES(21,20,22,'2025-12-08 02:30:32');
INSERT INTO "node_relations" VALUES(27,25,27,'2025-12-08 07:26:11');
INSERT INTO "node_relations" VALUES(28,26,25,'2025-12-08 07:26:26');
INSERT INTO "node_relations" VALUES(29,4,28,'2025-12-08 07:57:54');
INSERT INTO "node_relations" VALUES(30,26,29,'2025-12-08 07:58:03');
INSERT INTO "node_relations" VALUES(31,29,27,'2025-12-08 15:04:29');
INSERT INTO "node_relations" VALUES(32,26,30,'2025-12-08 15:04:43');
INSERT INTO "node_relations" VALUES(33,30,27,'2025-12-08 15:04:48');
INSERT INTO "node_relations" VALUES(34,27,31,'2025-12-08 15:12:34');
INSERT INTO "node_relations" VALUES(35,27,32,'2025-12-09 00:33:09');
INSERT INTO "node_relations" VALUES(36,26,33,'2025-12-09 00:33:43');
INSERT INTO "node_relations" VALUES(37,26,34,'2025-12-09 00:33:55');
INSERT INTO "node_relations" VALUES(38,26,35,'2025-12-09 00:34:18');
INSERT INTO "node_relations" VALUES(39,26,36,'2025-12-09 00:34:33');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" VALUES('d1_migrations',2);
INSERT INTO "sqlite_sequence" VALUES('node_relations',39);
INSERT INTO "sqlite_sequence" VALUES('nodes',36);
CREATE INDEX idx_nodes_parent_id ON nodes(parent_id);
CREATE INDEX idx_nodes_position ON nodes(position);
CREATE INDEX idx_nodes_created_at ON nodes(created_at);
CREATE INDEX idx_node_relations_parent ON node_relations(parent_node_id);
CREATE INDEX idx_node_relations_child ON node_relations(child_node_id);
