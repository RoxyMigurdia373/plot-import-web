<script setup lang="ts">defineProps<{message:string}>()</script><template><div v-if="message" class="notice" role="status">{{message}}</div></template>
