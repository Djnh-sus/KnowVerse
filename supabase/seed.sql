-- Chạy SAU schema.sql: tạo 5 môn cho cả 3 khối (bài học thì admin tự thêm sau).
insert into public.subjects (grade_id, name, slug, sort)
select gr.g, s.name, s.slug, s.sort
from (values (10), (11), (12)) as gr(g)
cross join (values ('Toán','toan',1), ('Lý','ly',2), ('Hóa','hoa',3), ('Sinh','sinh',4), ('Tin','tin',5)) as s(name, slug, sort);
