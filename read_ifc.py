import ifcopenshell
import ifcopenshell.geom

# Отваряме IFC файла
model = ifcopenshell.open("Duplex_A_20110907.ifc")

# Извеждаме основна информация за схемата
print("IFC схема:", model.schema)

# Извеждаме всички стени в модела
walls = model.by_type("IfcWall")
print("Брой стени:", len(walls))

# Разглеждаме първата стена по-подробно
first_wall = walls[0]
print("\nПървата стена:")
print("Име:", first_wall.Name)
print("GUID:", first_wall.GlobalId)
print("Тип:", first_wall.is_a())

# Преброяваме всички типове елементи в модела
from collections import Counter

all_elements = model.by_type("IfcProduct")
type_counts = Counter(el.is_a() for el in all_elements)

print("\nВсички типове елементи в модела:")
for element_type, count in sorted(type_counts.items(), key=lambda x: -x[1]):
    print(f"{element_type}: {count}")

# Настройваме геометричния "компилатор"
settings = ifcopenshell.geom.settings()
settings.set("use-world-coords", True)

# Взимаме първата стена и изчисляваме геометрията ѝ
wall = walls[0]
shape = ifcopenshell.geom.create_shape(settings, wall)

# Извеждаме координатите на всички върхове (vertices) на стената
verts = shape.geometry.verts  # плосък списък: x1,y1,z1,x2,y2,z2,...

print("\nБрой числа за върхове:", len(verts))
print("Първите 9 числа (3 точки):", verts[:9])

# Разделяме плоския списък на групи по 3 (X, Y, Z за всяка точка)
points = [(verts[i], verts[i+1], verts[i+2]) for i in range(0, len(verts), 3)]

# Намираме минимални и максимални стойности за всяка ос
xs = [p[0] for p in points]
ys = [p[1] for p in points]
zs = [p[2] for p in points]

bbox_min = (min(xs), min(ys), min(zs))
bbox_max = (max(xs), max(ys), max(zs))

print("\nBounding box:")
print("Минимум (X,Y,Z):", bbox_min)
print("Максимум (X,Y,Z):", bbox_max)

def bboxes_overlap(min1, max1, min2, max2):
    # Проверяваме припокриване по всяка от трите оси (X, Y, Z)
    for i in range(3):
        if max1[i] < min2[i] or max2[i] < min1[i]:
            return False  # няма припокриване по тази ос → няма пресичане
    return True  # припокрива се по всички оси → пресичат се

# Взимаме bounding box и за втора стена, за сравнение
wall2 = walls[1]
shape2 = ifcopenshell.geom.create_shape(settings, wall2)
verts2 = shape2.geometry.verts
points2 = [(verts2[i], verts2[i+1], verts2[i+2]) for i in range(0, len(verts2), 3)]
xs2 = [p[0] for p in points2]
ys2 = [p[1] for p in points2]
zs2 = [p[2] for p in points2]
bbox2_min = (min(xs2), min(ys2), min(zs2))
bbox2_max = (max(xs2), max(ys2), max(zs2))

result = bboxes_overlap(bbox_min, bbox_max, bbox2_min, bbox2_max)
print("\nСтена 1 и Стена 2 се пресичат ли?", result)  

print("\nИме на стена 1:", wall.Name)
print("Bounding box стена 1: min =", bbox_min, "max =", bbox_max)

print("\nИме на стена 2:", wall2.Name)
print("Bounding box стена 2: min =", bbox2_min, "max =", bbox2_max)

print("\n" + "="*50)
print("Зареждаме инсталационния модел (MEP)")
print("="*50)

# Отваряме втория модел
mep_model = ifcopenshell.open("Duplex_MEP_20110907.ifc")

# Проверяваме какви типове елементи има
mep_elements = mep_model.by_type("IfcProduct")
mep_type_counts = Counter(el.is_a() for el in mep_elements)

print("\nВсички типове елементи в MEP модела:")
for element_type, count in sorted(mep_type_counts.items(), key=lambda x: -x[1]):
    print(f"{element_type}: {count}")

print("\n" + "="*50)
print("Проверка за колизии: Стени vs Тръби/Канали")
print("="*50)

def get_bbox(element, settings):
    shape = ifcopenshell.geom.create_shape(settings, element)
    verts = shape.geometry.verts
    points = [(verts[i], verts[i+1], verts[i+2]) for i in range(0, len(verts), 3)]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

all_walls = model.by_type("IfcWallStandardCase")
flow_segments = mep_model.by_type("IfcFlowSegment")

print(f"\nИзчисляваме bounding box за {len(all_walls)} стени...")
wall_bboxes = []
for wall in all_walls:
    try:
        wall_bboxes.append((wall, *get_bbox(wall, settings)))
    except:
        continue

print(f"Изчисляваме bounding box за {len(flow_segments)} тръби/канали...")
segment_bboxes = []
for segment in flow_segments:
    try:
        segment_bboxes.append((segment, *get_bbox(segment, settings)))
    except:
        continue

from collections import defaultdict

clashes_by_wall = defaultdict(list)

for wall, wall_min, wall_max in wall_bboxes:
    for segment, seg_min, seg_max in segment_bboxes:
        if bboxes_overlap(wall_min, wall_max, seg_min, seg_max):
            clashes_by_wall[wall.Name].append(segment.Name)

print(f"\nОбщо намерени потенциални колизии: {sum(len(v) for v in clashes_by_wall.values())}")
print(f"Брой засегнати стени: {len(clashes_by_wall)}\n")

# Подреждаме стените по брой колизии, най-много първо
sorted_walls = sorted(clashes_by_wall.items(), key=lambda x: -len(x[1]))

for wall_name, segments in sorted_walls:
    print(f"'{wall_name}' — {len(segments)} потенциални пресичания")


 