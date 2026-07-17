import sqlite3
import json
import uuid
import numpy as np
from sklearn.cluster import DBSCAN

DB_PATH = "../backend/nube.db"

def run_clustering():
    print("[ClusterAI] Empezando proceso de agrupación de rostros...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT id, faces FROM files WHERE faces IS NOT NULL")
    rows = cur.fetchall()

    embeddings = []
    metadata = [] # Para mapear cada embedding de vuelta a su (file_id, face_index)

    for row in rows:
        file_id = row[0]
        try:
            faces = json.loads(row[1])
            for idx, face in enumerate(faces):
                if "embedding" in face and face["embedding"]:
                    embeddings.append(face["embedding"])
                    metadata.append({"file_id": file_id, "face_index": idx, "faces_array": faces})
        except Exception as e:
            print(f"Error parsing faces para file {file_id}: {e}")

    if len(embeddings) < 2:
        print("[ClusterAI] No hay suficientes rostros para agrupar.")
        return

    X = np.array(embeddings)
    
    # DBSCAN clustering usando distancia coseno. 
    # eps = 0.4 es un buen punto de partida para Facenet.
    clustering = DBSCAN(eps=0.4, min_samples=2, metric="cosine").fit(X)
    
    labels = clustering.labels_
    
    # Crear UUID para cada cluster válido (label != -1)
    cluster_to_person = {}
    for label in set(labels):
        if label != -1:
            cluster_to_person[label] = str(uuid.uuid4())

    # Agrupar las actualizaciones por file_id para no sobreescribir mutaciones si hay múltiples caras en la misma foto
    updates = {}
    for i, label in enumerate(labels):
        if label != -1: # Ignoramos el ruido
            person_id = cluster_to_person[label]
            file_id = metadata[i]["file_id"]
            face_index = metadata[i]["face_index"]
            
            if file_id not in updates:
                updates[file_id] = metadata[i]["faces_array"]
                
            updates[file_id][face_index]["personId"] = person_id

    # Guardar en BD
    for file_id, updated_faces in updates.items():
        cur.execute("UPDATE files SET faces = ? WHERE id = ?", (json.dumps(updated_faces), file_id))
    
    conn.commit()
    print(f"[ClusterAI] Agrupación terminada. Se encontraron {len(cluster_to_person)} personas distintas en {len(embeddings)} rostros.")
    conn.close()

if __name__ == "__main__":
    run_clustering()
