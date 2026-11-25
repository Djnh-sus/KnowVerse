# Lịch sử migration trên project KnowVerse

Áp dụng theo thứ tự (đã chạy qua Supabase MCP). `schema.sql` là bản hợp đồng dữ liệu gốc để tham khảo, đừng chạy lại.

1. `knowverse_01_enums_tables`: kiểu enum + 15 bảng
2. `knowverse_02_functions`: hàm RPC, trigger kiểm tra câu hỏi (đã có `set search_path = public`)
3. `knowverse_03_security_storage_seed`: RLS, policy, quyền, bucket, 5 môn x 3 khối
4. `knowverse_04_perf_policies_indexes`: bọc `auth.uid()`/`is_admin()` trong `(select ...)`, thêm index cho khóa ngoại, tách policy admin (không đổi hành vi)
