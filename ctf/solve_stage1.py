import hashlib
import itertools

TARGET = "4a6bc34076c8eef0f9eac59ad30d99bb4f56ecea4b0bfab92540fb655ac680f3"

nodes = list(range(9))

for length in range(1, 10):
    print(f"Trying length {length}...")
    for perm in itertools.permutations(nodes, length):
        pattern = ",".join(str(n) for n in perm)
        h = hashlib.sha256(pattern.encode("utf-8")).hexdigest()
        if h == TARGET:
            print(f"FOUND! Pattern: {pattern}")
            print(f"Hash: {h}")
            exit(0)

print("Not found")
